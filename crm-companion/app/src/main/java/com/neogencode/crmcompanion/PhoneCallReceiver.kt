package com.neogencode.crmcompanion

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telephony.TelephonyManager
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.IOException

class PhoneCallReceiver : BroadcastReceiver() {

    private val client = OkHttpClient()
    private val handler = Handler(Looper.getMainLooper())

    companion object {
        private var overlayView: View? = null
        private var lastState = ""
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == TelephonyManager.ACTION_PHONE_STATE_CHANGED) {
            val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE) ?: ""
            
            // Avoid duplicate triggers
            if (state == lastState) return
            lastState = state

            if (state == TelephonyManager.EXTRA_STATE_RINGING) {
                val incomingNumber = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)
                Log.d("PhoneCallReceiver", "Incoming Call Ringing: $incomingNumber")
                if (!incomingNumber.isNullOrEmpty()) {
                    lookupClientDetails(context, incomingNumber)
                }
            } else if (state == TelephonyManager.EXTRA_STATE_IDLE || state == TelephonyManager.EXTRA_STATE_OFFHOOK) {
                // Remove caller ID overlay when call ends or is answered
                removeOverlay(context)
            }
        }
    }

    private fun lookupClientDetails(context: Context, phoneNumber: String) {
        val prefs = context.getSharedPreferences("crm_prefs", Context.MODE_PRIVATE)
        val sheetsUrl = prefs.getString("sheets_url", "") ?: ""

        if (sheetsUrl.isEmpty()) return

        val url = "$sheetsUrl?action=lookup&phone=$phoneNumber"
        val request = Request.Builder().url(url).build()

        client.newCall(request).enqueue(object : okhttp3.Callback {
            override fun onFailure(call: okhttp3.Call, e: IOException) {
                Log.e("PhoneCallReceiver", "Lookup failed: ${e.message}")
            }

            override fun onResponse(call: okhttp3.Call, response: okhttp3.Response) {
                if (response.isSuccessful) {
                    val responseBody = response.body?.string() ?: ""
                    if (responseBody.isNotEmpty()) {
                        try {
                            val json = JSONObject(responseBody)
                            val found = json.optBoolean("found", false)
                            if (found) {
                                val name = json.optString("name", "Unknown Lead")
                                val designation = json.optString("designation", "")
                                val status = json.optString("status", "")
                                val summary = json.optString("summary", "")
                                
                                handler.post {
                                    showCallerIdOverlay(context, name, designation, status, summary)
                                }
                            }
                        } catch (e: Exception) {
                            Log.e("PhoneCallReceiver", "JSON parsing error: ${e.message}")
                        }
                    }
                }
            }
        })
    }

    private fun showCallerIdOverlay(
        context: Context,
        name: String,
        designation: String,
        status: String,
        summary: String
    ) {
        // If an overlay already exists, remove it first
        if (overlayView != null) {
            removeOverlay(context)
        }

        val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val inflater = context.getSystemService(Context.LAYOUT_INFLATER_SERVICE) as LayoutInflater
        
        val view = inflater.inflate(R.layout.dialog_caller_id, null)
        overlayView = view

        // Populate details
        view.findViewById<TextView>(R.id.callerNameText).text = name
        view.findViewById<TextView>(R.id.callerDesignationText).text = designation.ifEmpty { "No Designation" }
        view.findViewById<TextView>(R.id.callerStatusText).text = "CRM Lead Status: $status"
        view.findViewById<TextView>(R.id.callerSummaryText).text = summary.ifEmpty { "No summary notes recorded." }

        view.findViewById<Button>(R.id.btnClosePopup).setOnClickListener {
            removeOverlay(context)
        }

        // Set layout overlay parameter configuration flags
        val layoutFlag = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            WindowManager.LayoutParams.TYPE_PHONE
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            layoutFlag,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
            PixelFormat.TRANSLUCENT
        )

        windowManager.addView(view, params)
    }

    private fun removeOverlay(context: Context) {
        overlayView?.let {
            try {
                val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
                windowManager.removeView(it)
            } catch (e: Exception) {
                Log.e("PhoneCallReceiver", "Error removing overlay: ${e.message}")
            }
            overlayView = null
        }
    }
}
