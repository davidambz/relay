// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

package com.davidambz.relay;

import android.content.res.Configuration;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PipPlugin.class);
        registerPlugin(ScreenPlugin.class);
        super.onCreate(savedInstanceState);
        // The stream arrives a moment after the tap on "Watch"; let it start
        // playing (with sound) without needing a second gesture.
        getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
    }

    private PipPlugin pip() {
        PluginHandle handle = getBridge().getPlugin("RelayPip");
        return handle == null ? null : (PipPlugin) handle.getInstance();
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        PipPlugin pip = pip();
        if (pip != null) pip.enterIfWatching();
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        PipPlugin pip = pip();
        if (pip != null) pip.notifyPipChanged(isInPictureInPictureMode);
    }
}
