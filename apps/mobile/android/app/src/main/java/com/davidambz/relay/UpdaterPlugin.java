// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

package com.davidambz.relay;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.ConnectivityManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Self-update for the Android app: downloads a release APK into the cache,
 * checks it (SHA-256 when GitHub reports one, same package, newer version,
 * signed with the same key as the app running), and installs it through
 * PackageInstaller. On Android 12+ an app updating itself can skip the
 * confirmation; before that, and the first time "install unknown apps" is
 * off, the system asks.
 *
 * Which release to fetch and when is decided in TypeScript (updater.ts).
 */
@CapacitorPlugin(name = "RelayUpdater")
public class UpdaterPlugin extends Plugin {
    static final String INSTALL_ACTION = "com.davidambz.relay.INSTALL_STATUS";
    private static UpdaterPlugin current;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    @Override
    public void load() {
        current = this;
    }

    private File updatesDir() {
        File dir = new File(getContext().getCacheDir(), "updates");
        dir.mkdirs();
        return dir;
    }

    private File apkFor(String version) {
        return new File(updatesDir(), "Relay-" + version.replaceAll("[^0-9.]", "") + ".apk");
    }

    @PluginMethod
    public void isMetered(PluginCall call) {
        ConnectivityManager connectivity = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        JSObject result = new JSObject();
        result.put("metered", connectivity == null || connectivity.isActiveNetworkMetered());
        call.resolve(result);
    }

    @PluginMethod
    public void isDownloaded(PluginCall call) {
        String version = call.getString("version", "");
        JSObject result = new JSObject();
        result.put("downloaded", !version.isEmpty() && apkFor(version).isFile());
        call.resolve(result);
    }

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        String version = call.getString("version");
        String sha256 = call.getString("sha256");
        if (url == null || version == null || !url.startsWith("https://github.com/")) {
            call.reject("Bad download request", "bad-request");
            return;
        }
        worker.execute(() -> {
            File target = apkFor(version);
            File partial = new File(target.getPath() + ".part");
            try {
                // Only the newest download is kept.
                File[] old = updatesDir().listFiles();
                if (old != null) for (File file : old) if (!file.equals(target)) file.delete();
                if (!target.isFile()) {
                    String actual = fetch(url, partial);
                    if (sha256 != null && !sha256.equalsIgnoreCase(actual)) {
                        throw new SecurityException("The download doesn't match its published checksum");
                    }
                    verifyApk(partial);
                    if (!partial.renameTo(target)) throw new IllegalStateException("Couldn't keep the download");
                }
                call.resolve();
            } catch (Exception error) {
                partial.delete();
                call.reject(error.getMessage() == null ? error.toString() : error.getMessage(), "download-failed", error);
            }
        });
    }

    /** Streams the file to disk (it's tens of MB), returning its SHA-256 in hex. */
    private String fetch(String address, File file) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(address).openConnection();
        connection.setInstanceFollowRedirects(true);
        connection.setConnectTimeout(20000);
        connection.setReadTimeout(30000);
        connection.setRequestProperty("User-Agent", "Relay-Updater");
        int status = connection.getResponseCode();
        if (status != 200) throw new IllegalStateException("Download failed with " + status);
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream in = connection.getInputStream(); OutputStream out = new FileOutputStream(file)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = in.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
                out.write(buffer, 0, read);
            }
        } finally {
            connection.disconnect();
        }
        StringBuilder hex = new StringBuilder();
        for (byte b : digest.digest()) hex.append(String.format("%02x", b));
        return hex.toString();
    }

    /** Same package, a newer version, and signed by the same key as this app. */
    private void verifyApk(File apk) throws Exception {
        PackageManager manager = getContext().getPackageManager();
        String name = getContext().getPackageName();
        PackageInfo update = manager.getPackageArchiveInfo(apk.getPath(), 0);
        PackageInfo installed = manager.getPackageInfo(name, 0);
        if (update == null) throw new SecurityException("The download isn't an app package");
        if (!name.equals(update.packageName)) throw new SecurityException("The download is a different app");
        if (versionCode(update) <= versionCode(installed)) throw new IllegalStateException("The download isn't newer");
        Set<String> theirs = signers(manager, apk.getPath(), null);
        if (theirs.isEmpty() || !theirs.equals(signers(manager, null, name))) {
            throw new SecurityException("The download isn't signed with Relay's key");
        }
    }

    @SuppressWarnings("deprecation")
    private static long versionCode(PackageInfo info) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
    }

    /**
     * SHA-256 of each certificate an APK file (or the installed app) is
     * signed with, not counting past keys. Some Android versions leave the
     * newer signingInfo empty for an APK file; the old field is the fallback.
     */
    @SuppressWarnings("deprecation")
    private static Set<String> signers(PackageManager manager, String apkPath, String packageName) throws Exception {
        Signature[] signatures = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            int flags = PackageManager.GET_SIGNING_CERTIFICATES;
            PackageInfo info = apkPath != null ? manager.getPackageArchiveInfo(apkPath, flags) : manager.getPackageInfo(packageName, flags);
            if (info != null && info.signingInfo != null) signatures = info.signingInfo.getApkContentsSigners();
        }
        if (signatures == null || signatures.length == 0) {
            int flags = PackageManager.GET_SIGNATURES;
            PackageInfo info = apkPath != null ? manager.getPackageArchiveInfo(apkPath, flags) : manager.getPackageInfo(packageName, flags);
            if (info != null) signatures = info.signatures;
        }
        Set<String> result = new HashSet<>();
        if (signatures == null) return result;
        for (Signature signature : signatures) {
            StringBuilder hex = new StringBuilder();
            for (byte b : MessageDigest.getInstance("SHA-256").digest(signature.toByteArray())) hex.append(String.format("%02x", b));
            result.add(hex.toString());
        }
        return result;
    }

    @PluginMethod
    public void install(PluginCall call) {
        String version = call.getString("version", "");
        File apk = apkFor(version);
        if (version.isEmpty() || !apk.isFile()) {
            call.reject("Nothing downloaded to install", "not-downloaded");
            return;
        }
        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.getPackageManager().canRequestPackageInstalls()) {
            // "Install unknown apps" is off for Relay: send the person to
            // the switch. They come back and tap install again.
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + context.getPackageName()));
            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(settings);
            call.reject("Allow Relay to install apps first", "permission");
            return;
        }
        worker.execute(() -> {
            try {
                PackageInstaller installer = context.getPackageManager().getPackageInstaller();
                PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
                params.setAppPackageName(context.getPackageName());
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
                }
                int id = installer.createSession(params);
                try (PackageInstaller.Session session = installer.openSession(id)) {
                    try (InputStream in = new FileInputStream(apk); OutputStream out = session.openWrite("relay.apk", 0, apk.length())) {
                        byte[] buffer = new byte[64 * 1024];
                        int read;
                        while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
                        session.fsync(out);
                    }
                    Intent intent = new Intent(context, InstallReceiver.class).setAction(INSTALL_ACTION);
                    int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0);
                    PendingIntent pending = PendingIntent.getBroadcast(context, id, intent, flags);
                    session.commit(pending.getIntentSender());
                }
                call.resolve();
            } catch (Exception error) {
                call.reject(error.getMessage() == null ? error.toString() : error.getMessage(), "install-failed", error);
            }
        });
    }

    /** From InstallReceiver: how the install went ("failed" carries why). */
    static void report(String status, String message) {
        UpdaterPlugin plugin = current;
        if (plugin == null) return;
        JSObject data = new JSObject();
        data.put("status", status);
        if (message != null) data.put("message", message);
        plugin.notifyListeners("installStatus", data);
    }
}
