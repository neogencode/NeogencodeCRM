package com.neogencode.crmcompanion

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private lateinit var sheetsUrlInput: EditText
    private lateinit var statusText: TextView
    private lateinit var btnToggleSync: Button
    private lateinit var btnRequestPermissions: Button

    private val PERMISSION_REQUEST_CODE = 101

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        sheetsUrlInput = findViewById(R.id.sheetsUrlInput)
        statusText = findViewById(R.id.statusText)
        btnToggleSync = findViewById(R.id.btnToggleSync)
        btnRequestPermissions = findViewById(R.id.btnRequestPermissions)

        // Load existing Sheets Web App URL preference
        val prefs = getSharedPreferences("crm_prefs", Context.MODE_PRIVATE)
        val savedUrl = prefs.getString("sheets_url", "")
        sheetsUrlInput.setText(savedUrl)

        btnRequestPermissions.setOnClickListener {
            checkAndRequestSystemOverlayPermission()
            requestTelephonyPermissions()
        }

        btnToggleSync.setOnClickListener {
            val url = sheetsUrlInput.text.toString().trim()
            if (url.isEmpty()) {
                Toast.makeText(this, "Please enter Google Sheets script Web App URL first", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            
            // Save Sheets Web App URL to SharedPreferences
            prefs.edit().putString("sheets_url", url).apply()

            val serviceIntent = Intent(this, CallSyncService::class.java)
            if (CallSyncService.isRunning) {
                stopService(serviceIntent)
                statusText.text = "Stopped"
                statusText.setTextColor(ContextCompat.getColor(this, android.R.color.holo_red_dark))
                btnToggleSync.text = "Start Call Sync Listener"
            } else {
                startService(serviceIntent)
                statusText.text = "Running"
                statusText.setTextColor(ContextCompat.getColor(this, android.R.color.holo_green_dark))
                btnToggleSync.text = "Stop Call Sync Listener"
            }
        }

        updateServiceStatusDisplay()
    }

    private fun updateServiceStatusDisplay() {
        if (CallSyncService.isRunning) {
            statusText.text = "Running"
            statusText.setTextColor(ContextCompat.getColor(this, android.R.color.holo_green_dark))
            btnToggleSync.text = "Stop Call Sync Listener"
        } else {
            statusText.text = "Stopped"
            statusText.setTextColor(ContextCompat.getColor(this, android.R.color.holo_red_dark))
            btnToggleSync.text = "Start Call Sync Listener"
        }
    }

    private fun checkAndRequestSystemOverlayPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!Settings.canDrawOverlays(this)) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:$packageName")
                )
                startActivity(intent)
            } else {
                Toast.makeText(this, "Overlay Drawing permission already active!", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun requestTelephonyPermissions() {
        val permissions = arrayOf(
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.CALL_PHONE,
            Manifest.permission.READ_CALL_LOG
        )

        val neededPermissions = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (neededPermissions.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, neededPermissions.toTypedArray(), PERMISSION_REQUEST_CODE)
        } else {
            Toast.makeText(this, "Telephony permissions already active!", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onResume() {
        super.onResume()
        updateServiceStatusDisplay()
    }
}
