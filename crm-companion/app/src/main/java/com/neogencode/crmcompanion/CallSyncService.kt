package com.neogencode.crmcompanion

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import android.widget.Toast
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import java.io.IOException

class CallSyncService : Service() {

    private val handler = Handler(Looper.getMainLooper())
    private val client = OkHttpClient()
    private var sheetsUrl = ""

    private val pollRunnable = object : Runnable {
        override fun run() {
            if (sheetsUrl.isNotEmpty()) {
                fetchDialingRequests()
            }
            // Poll every 5 seconds
            handler.postDelayed(this, 5000)
        }
    }

    companion object {
        var isRunning = false
    }

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        
        val prefs = getSharedPreferences("crm_prefs", Context.MODE_PRIVATE)
        sheetsUrl = prefs.getString("sheets_url", "") ?: ""

        createNotificationChannel()
        val notification = NotificationCompat.Builder(this, "call_sync_channel")
            .setContentTitle("CRM Call Sync Active")
            .setContentText("Listening for outbound dialing commands...")
            .setSmallIcon(android.R.drawable.sym_def_app_icon)
            .build()
            
        startForeground(1, notification)
        handler.post(pollRunnable)
    }

    override fun onDestroy() {
        super.onDestroy()
        isRunning = false
        handler.removeCallbacks(pollRunnable)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun fetchDialingRequests() {
        val url = "$sheetsUrl?action=get_calls"
        val request = Request.Builder().url(url).build()

        client.newCall(request).enqueue(object : okhttp3.Callback {
            override fun onFailure(call: okhttp3.Call, e: IOException) {
                Log.e("CallSyncService", "Fetch Failed: ${e.message}")
            }

            override fun onResponse(call: okhttp3.Call, response: okhttp3.Response) {
                if (response.isSuccessful) {
                    val responseBody = response.body?.string() ?: ""
                    if (responseBody.isNotEmpty()) {
                        try {
                            val jsonArray = JSONArray(responseBody)
                            for (i in 0 until jsonArray.length()) {
                                val obj = jsonArray.getJSONObject(i)
                                val phone = obj.getString("phone")
                                val name = obj.getString("name")
                                
                                handler.post {
                                    triggerSystemDial(phone, name)
                                }
                            }
                        } catch (e: Exception) {
                            Log.e("CallSyncService", "Parsing error: ${e.message}")
                        }
                    }
                }
            }
        })
    }

    private fun triggerSystemDial(phone: String, name: String) {
        Toast.makeText(this, "CRM Dial Request: Calling $name ($phone)", Toast.LENGTH_LONG).show()
        val intent = Intent(Intent.ACTION_CALL).apply {
            data = Uri.parse("tel:$phone")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED) {
            startActivity(intent)
        } else {
            // Fallback to Dial intent if permission is lacking
            val dialIntent = Intent(Intent.ACTION_DIAL).apply {
                data = Uri.parse("tel:$phone")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            startActivity(dialIntent)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val serviceChannel = NotificationChannel(
                "call_sync_channel",
                "CRM Call Sync Service",
                NotificationManager.IMPORTANCE_DEFAULT
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(serviceChannel)
        }
    }
}
