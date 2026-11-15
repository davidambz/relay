// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

package com.davidambz.relay;

import android.app.PictureInPictureParams;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Rational;
import android.view.WindowManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Picture-in-Picture for the viewer. Android's WebView has no
 * requestPictureInPicture, so the whole activity goes into PiP and the
 * web player (full-bleed) fills the small window.
 *
 * setWatching(true) while a broadcast is playing: leaving the app (Home,
 * recents) enters PiP automatically, and the screen stays on.
 */
@CapacitorPlugin(name = "RelayPip")
public class PipPlugin extends Plugin {
    private static final Rational ASPECT = new Rational(16, 9);
    private boolean watching = false;

    boolean isWatching() {
        return watching;
    }

    private boolean supported() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && getActivity().getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", supported());
        call.resolve(result);
    }

    @PluginMethod
    public void enter(PluginCall call) {
        if (!supported()) {
            call.reject("Picture-in-Picture isn't available on this device");
            return;
        }
        getActivity().runOnUiThread(() -> {
            boolean entered = getActivity().enterPictureInPictureMode(params(watching));
            if (entered) call.resolve();
            else call.reject("The system refused Picture-in-Picture");
        });
    }

    @PluginMethod
    public void setWatching(PluginCall call) {
        watching = Boolean.TRUE.equals(call.getBoolean("active", false));
        getActivity().runOnUiThread(() -> {
            if (watching) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            // Android 12+: let the system animate into PiP on its own when the
            // user leaves. Older versions use MainActivity.onUserLeaveHint.
            if (supported()) getActivity().setPictureInPictureParams(params(watching));
        });
        call.resolve();
    }

    PictureInPictureParams params(boolean autoEnter) {
        PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder().setAspectRatio(ASPECT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) builder.setAutoEnterEnabled(autoEnter);
        return builder.build();
    }

    /** Called by MainActivity when the activity enters or leaves PiP. */
    void notifyPipChanged(boolean active) {
        JSObject state = new JSObject();
        state.put("active", active);
        notifyListeners("pipChanged", state);
    }

    /** Pre-Android 12 auto-enter, from MainActivity.onUserLeaveHint. */
    void enterIfWatching() {
        if (watching && supported() && Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            getActivity().enterPictureInPictureMode(params(false));
        }
    }
}
