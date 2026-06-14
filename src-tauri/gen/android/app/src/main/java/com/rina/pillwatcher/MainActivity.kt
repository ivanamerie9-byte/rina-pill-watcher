package com.rina.pillwatcher

import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Register our plugin via PluginManager; load(webView) is called later by Tauri when WebView is ready
    getPluginManager().load(null, "PillScheduler", PillSchedulerPlugin(this), "{}")
  }
}
