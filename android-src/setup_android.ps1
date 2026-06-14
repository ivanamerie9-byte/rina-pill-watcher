# Run this script AFTER: cargo tauri android init
# It copies Kotlin sources and patches AndroidManifest.xml

param (
    [string]$PackagePath = "src-tauri\gen\android\app\src\main\java\com\rina\pillwatcher"
)

$Root = Split-Path $PSScriptRoot -Parent

# 1. Copy Kotlin files
Write-Host "Copying Kotlin sources..."
$Dest = Join-Path $Root $PackagePath
New-Item -ItemType Directory -Force $Dest | Out-Null

Get-ChildItem "$PSScriptRoot\*.kt" | ForEach-Object {
    Copy-Item $_.FullName -Destination $Dest -Force
    Write-Host "  Copied: $($_.Name)"
}

# 2. Patch MainActivity.kt to register our plugin
$mainActivity = Join-Path $Dest "MainActivity.kt"
if (Test-Path $mainActivity) {
    $content = Get-Content $mainActivity -Raw
    if ($content -notmatch "PillSchedulerPlugin") {
        $content = $content -replace
            '(super\.onCreate\(savedInstanceState\))',
            '$1`n        registerPlugin(PillSchedulerPlugin::class.java)'
        Set-Content $mainActivity $content -Encoding UTF8
        Write-Host "  Patched: MainActivity.kt"
    } else {
        Write-Host "  Skipped: MainActivity.kt (already patched)"
    }
}

# 3. Patch AndroidManifest.xml
$manifest = Join-Path $Root "src-tauri\gen\android\app\src\main\AndroidManifest.xml"
if (Test-Path $manifest) {
    $xml = Get-Content $manifest -Raw

    $permissions = @(
        '<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>',
        '<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>',
        '<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM"/>',
        '<uses-permission android:name="android.permission.USE_EXACT_ALARM"/>',
        '<uses-permission android:name="android.permission.VIBRATE"/>',
        '<uses-permission android:name="android.permission.WAKE_LOCK"/>',
        '<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>'
    )
    foreach ($perm in $permissions) {
        if ($xml -notmatch [regex]::Escape($perm.Trim())) {
            $xml = $xml -replace '(<manifest[^>]*>)', "`$1`n    $perm"
        }
    }

    $receivers = @'

        <receiver android:name=".PillAlarmReceiver"
            android:exported="false"/>
        <receiver android:name=".NotificationActionReceiver"
            android:exported="false"/>
        <receiver android:name=".BootReceiver"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED"/>
            </intent-filter>
        </receiver>
'@
    if ($xml -notmatch "PillAlarmReceiver") {
        $xml = $xml -replace '(</application>)', "$receivers`$1"
    }

    Set-Content $manifest $xml -Encoding UTF8
    Write-Host "  Patched: AndroidManifest.xml"
}

# 4. Add WorkManager dependency to build.gradle
$buildGradle = Join-Path $Root "src-tauri\gen\android\app\build.gradle.kts"
if (Test-Path $buildGradle) {
    $gradle = Get-Content $buildGradle -Raw
    if ($gradle -notmatch "work-runtime") {
        $gradle = $gradle -replace '(dependencies \{)', '$1
    implementation("androidx.work:work-runtime-ktx:2.9.1")'
        Set-Content $buildGradle $gradle -Encoding UTF8
        Write-Host "  Patched: build.gradle.kts (added WorkManager)"
    }
}

Write-Host ""
Write-Host "Done! Now run: cargo tauri android build --apk"
