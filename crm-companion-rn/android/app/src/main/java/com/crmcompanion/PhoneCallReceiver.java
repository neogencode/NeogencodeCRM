package com.crmcompanion;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.telephony.TelephonyManager;
import android.util.Log;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Scanner;
import org.json.JSONObject;

public class PhoneCallReceiver extends BroadcastReceiver {

    private static LinearLayout overlayLayout;
    private static String lastState = "";
    
    // Call duration variables
    private static long callStartTime = 0;
    private static String activePhoneNumber = "";

    @Override
    public void onReceive(final Context context, Intent intent) {
        if (TelephonyManager.ACTION_PHONE_STATE_CHANGED.equals(intent.getAction())) {
            String state = intent.getStringExtra(TelephonyManager.EXTRA_STATE);
            if (state == null || state.equals(lastState)) return;
            lastState = state;

            if (TelephonyManager.EXTRA_STATE_RINGING.equals(state)) {
                String incomingNumber = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER);
                if (incomingNumber != null && !incomingNumber.isEmpty()) {
                    activePhoneNumber = incomingNumber;
                    lookupIncomingCaller(context, incomingNumber);
                }
            } else if (TelephonyManager.EXTRA_STATE_OFFHOOK.equals(state)) {
                // Call connected (either inbound answered or outbound dialing)
                callStartTime = System.currentTimeMillis();
                removeCallerIdOverlay(context);
            } else if (TelephonyManager.EXTRA_STATE_IDLE.equals(state)) {
                removeCallerIdOverlay(context);
                
                // Call disconnected, tally call log duration
                if (callStartTime > 0) {
                    long durationMs = System.currentTimeMillis() - callStartTime;
                    long durationSec = durationMs / 1000;
                    
                    // Retrieve phone number from intent if empty
                    String phone = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER);
                    if (phone == null || phone.isEmpty()) {
                        phone = activePhoneNumber;
                    }
                    
                    if (phone != null && !phone.isEmpty()) {
                        syncCallLogToSheets(context, phone, durationSec);
                    }
                    
                    // Reset call timers
                    callStartTime = 0;
                    activePhoneNumber = "";
                }
            }
        }
    }

    private void lookupIncomingCaller(final Context context, final String phone) {
        SharedPreferences prefs = context.getSharedPreferences("ReactNativeLocalStorage", Context.MODE_PRIVATE);
        String rawSheetsUrl = prefs.getString("google_sheets_url", "");
        if (rawSheetsUrl == null || rawSheetsUrl.isEmpty()) {
            prefs = context.getSharedPreferences("crm_prefs", Context.MODE_PRIVATE);
            rawSheetsUrl = prefs.getString("sheets_url", "");
        }
        
        if (rawSheetsUrl == null || rawSheetsUrl.isEmpty()) return;
        final String sheetsUrl = rawSheetsUrl.replace("\"", "");

        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    URL url = new URL(sheetsUrl + "?action=lookup&phone=" + phone);
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("GET");
                    conn.connect();

                    if (conn.getResponseCode() == 200) {
                        InputStream stream = conn.getInputStream();
                        Scanner scanner = new Scanner(stream).useDelimiter("\\A");
                        String response = scanner.hasNext() ? scanner.next() : "";
                        
                        JSONObject json = new JSONObject(response);
                        if (json.optBoolean("found", false)) {
                            final String name = json.optString("name", "CRM Contact");
                            final String desc = json.optString("designation", "");
                            final String status = json.optString("status", "");
                            final String summary = json.optString("summary", "");

                            new Handler(Looper.getMainLooper()).post(new Runnable() {
                                @Override
                                public void run() {
                                    showCallerIdOverlay(context, name, desc, status, summary);
                                }
                            });
                        }
                    }
                } catch (Exception e) {
                    Log.e("PhoneCallReceiver", "Network error: " + e.getMessage());
                }
            }
        }).start();
    }

    private void syncCallLogToSheets(final Context context, final String phone, final long durationSec) {
        SharedPreferences prefs = context.getSharedPreferences("ReactNativeLocalStorage", Context.MODE_PRIVATE);
        String rawSheetsUrl = prefs.getString("google_sheets_url", "");
        if (rawSheetsUrl == null || rawSheetsUrl.isEmpty()) {
            prefs = context.getSharedPreferences("crm_prefs", Context.MODE_PRIVATE);
            rawSheetsUrl = prefs.getString("sheets_url", "");
        }
        
        if (rawSheetsUrl == null || rawSheetsUrl.isEmpty()) return;
        final String sheetsUrl = rawSheetsUrl.replace("\"", "");

        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    URL url = new URL(sheetsUrl);
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setDoOutput(true);
                    conn.setRequestProperty("Content-Type", "application/json");

                    JSONObject payload = new JSONObject();
                    payload.put("event", "call_log");
                    payload.put("phone", phone);
                    payload.put("duration", formatDuration(durationSec));
                    payload.put("timestamp", new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new java.util.Date()));

                    OutputStream os = conn.getOutputStream();
                    os.write(payload.toString().getBytes("UTF-8"));
                    os.close();
                    
                    conn.getResponseCode(); // Trigger request
                    conn.disconnect();
                } catch (Exception e) {
                    Log.e("PhoneCallReceiver", "Call Log sync failed: " + e.getMessage());
                }
            }
        }).start();
    }

    private String formatDuration(long totalSecs) {
        long hours = totalSecs / 3600;
        long minutes = (totalSecs % 3600) / 60;
        long seconds = totalSecs % 60;
        
        if (hours > 0) {
            return String.format("%dh %dm %ds", hours, minutes, seconds);
        } else if (minutes > 0) {
            return String.format("%dm %ds", minutes, seconds);
        } else {
            return String.format("%ds", seconds);
        }
    }

    private void showCallerIdOverlay(final Context context, String name, String desc, String status, String summary) {
        if (overlayLayout != null) {
            removeCallerIdOverlay(context);
        }

        final WindowManager windowManager = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
        overlayLayout = new LinearLayout(context);
        overlayLayout.setOrientation(LinearLayout.VERTICAL);
        overlayLayout.setBackgroundColor(0xFF1E293B);
        overlayLayout.setPadding(30, 30, 30, 30);

        LinearLayout header = new LinearLayout(context);
        header.setOrientation(LinearLayout.HORIZONTAL);
        TextView title = new TextView(context);
        title.setText("CRM CALLER MATCH");
        title.setTextColor(0xFFA855F7);
        title.setTextSize(12);
        header.addView(title);
        overlayLayout.addView(header);

        TextView nameView = new TextView(context);
        nameView.setText(name);
        nameView.setTextColor(0xFFFFFFFF);
        nameView.setTextSize(18);
        nameView.setPadding(0, 10, 0, 4);
        overlayLayout.addView(nameView);

        TextView descView = new TextView(context);
        descView.setText(desc.isEmpty() ? "No Designation" : desc);
        descView.setTextColor(0xFF94A3B8);
        descView.setTextSize(13);
        descView.setPadding(0, 0, 0, 8);
        overlayLayout.addView(descView);

        TextView statusView = new TextView(context);
        statusView.setText("Lead Status: " + status);
        statusView.setTextColor(0xFFFFFFFF);
        statusView.setBackgroundColor(0xFF38BDF8);
        statusView.setPadding(10, 4, 10, 4);
        overlayLayout.addView(statusView);

        TextView notesLabel = new TextView(context);
        notesLabel.setText("CRM Summary / Notes:");
        notesLabel.setTextColor(0xFF64748B);
        notesLabel.setTextSize(11);
        notesLabel.setPadding(0, 12, 0, 2);
        overlayLayout.addView(notesLabel);

        TextView summaryView = new TextView(context);
        summaryView.setText(summary.isEmpty() ? "No notes recorded." : summary);
        summaryView.setTextColor(0xFFF8FAFC);
        summaryView.setTextSize(12);
        overlayLayout.addView(summaryView);

        int layoutFlag = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O 
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY 
            : WindowManager.LayoutParams.TYPE_PHONE;

        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            layoutFlag,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE |
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
            PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.TOP;
        params.y = 100;

        windowManager.addView(overlayLayout, params);
    }

    private void removeCallerIdOverlay(Context context) {
        if (overlayLayout != null) {
            try {
                WindowManager windowManager = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
                windowManager.removeView(overlayLayout);
            } catch (Exception e) {
                Log.e("PhoneCallReceiver", "Error removing layout: " + e.getMessage());
            }
            overlayLayout = null;
        }
    }
}
