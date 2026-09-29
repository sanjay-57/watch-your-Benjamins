package app.watchyourbenjamins;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.provider.Telephony;
import android.telephony.SmsMessage;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * Turns IOB UPI debit alerts into a small on-device queue that the web app drains into the
 * ledger (docs/NATIVE_BRIDGE.md, "Automatic logging").
 *
 * <p>Privacy: messages that are not an IOB UPI debit from the configured account are dropped on the
 * spot. Nothing but amount, reference and time is kept, and only until the app has saved it.
 */
public final class SmsReceiver extends BroadcastReceiver {
    private static final String TAG = "WYB";

    /** Set by MainActivity while it is on screen, so a new IOB alert is picked up immediately. */
    static volatile Runnable listener;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;
        SmsMessage[] parts = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (parts == null || parts.length == 0) return;
        SmsStore store = new SmsStore(context);
        if (!store.enabled()) return;
        String last4 = store.last4();
        boolean credits = store.credits();

        // A long alert arrives as several parts; stitch them per sender before reading.
        Map<String, StringBuilder> bodies = new LinkedHashMap<>();
        Map<String, Long> times = new LinkedHashMap<>();
        for (SmsMessage m : parts) {
            if (m == null || m.getOriginatingAddress() == null) continue;
            String from = m.getOriginatingAddress();
            StringBuilder sb = bodies.get(from);
            if (sb == null) {
                bodies.put(from, sb = new StringBuilder());
                times.put(from, m.getTimestampMillis());
            }
            if (m.getMessageBody() != null) sb.append(m.getMessageBody());
        }

        boolean sawIob = false;
        for (Map.Entry<String, StringBuilder> e : bodies.entrySet()) {
            String from = e.getKey();
            if (!IobSms.fromIob(from)) continue; // not from IOB: never looked at again
            IobSms.Result r = IobSms.parse(from, e.getValue().toString(), last4, credits);
            sawIob = true;
            store.noteResult(r.status);
            Log.i(TAG, "IOB sms: " + r.status);
            if (r.status == IobSms.Status.OK) {
                store.enqueue(r, times.get(from));
            }
        }
        if (sawIob) { // also for ignored alerts, so the settings screen can show why
            Runnable l = listener;
            if (l != null) new Handler(Looper.getMainLooper()).post(l);
        }
    }

    /** Config + queue in one private SharedPreferences file; all access is serialised. */
    static final class SmsStore {
        private static final Object LOCK = new Object();
        private static final int MAX_QUEUE = 200;
        private final SharedPreferences p;

        SmsStore(Context c) {
            p = c.getApplicationContext().getSharedPreferences("wyb_sms", Context.MODE_PRIVATE);
        }

        boolean enabled() {
            return p.getBoolean("on", false);
        }

        String last4() {
            return p.getString("last4", "");
        }

        boolean credits() {
            return p.getBoolean("credits", false);
        }

        void setConfig(boolean on, String last4, boolean credits) {
            synchronized (LOCK) {
                p.edit().putBoolean("on", on && last4.length() == 4).putString("last4", last4).putBoolean("credits", credits).apply();
            }
        }

        /** Status of the latest IOB message, for the settings screen (no message text is kept). */
        void noteResult(IobSms.Status s) {
            synchronized (LOCK) {
                p.edit().putLong("lastTs", System.currentTimeMillis()).putString("lastStatus", s.name()).apply();
            }
        }

        JSONObject lastResult() {
            String s = p.getString("lastStatus", null);
            if (s == null) return null;
            try {
                return new JSONObject().put("ts", p.getLong("lastTs", 0)).put("status", s);
            } catch (JSONException e) {
                return null;
            }
        }

        /** Returns false for a duplicate alert (same reference already waiting). */
        boolean enqueue(IobSms.Result r, long ts) {
            String dir = r.kind == IobSms.Kind.CREDIT ? "c" : "d";
            String id = r.ref.isEmpty() ? dir + "t" + ts + "_" + r.paise : dir + "r" + r.ref;
            synchronized (LOCK) {
                JSONArray q = readQueue();
                for (int i = 0; i < q.length(); i++) {
                    if (id.equals(q.optJSONObject(i).optString("id"))) return false;
                }
                try {
                    q.put(new JSONObject().put("id", id).put("paise", r.paise).put("ref", r.ref)
                            .put("to", r.toLast4).put("dir", r.kind == IobSms.Kind.CREDIT ? "credit" : "debit").put("ts", ts));
                } catch (JSONException e) {
                    return false;
                }
                p.edit().putString("queue", trim(q).toString()).commit(); // durable before the broadcast ends
                return true;
            }
        }

        String pendingJson() {
            synchronized (LOCK) {
                return readQueue().toString();
            }
        }

        void ack(String idsJson) {
            Set<String> done = new HashSet<>();
            try {
                JSONArray ids = new JSONArray(idsJson);
                for (int i = 0; i < ids.length(); i++) done.add(ids.getString(i));
            } catch (JSONException e) {
                return;
            }
            synchronized (LOCK) {
                JSONArray q = readQueue();
                JSONArray keep = new JSONArray();
                for (int i = 0; i < q.length(); i++) {
                    JSONObject o = q.optJSONObject(i);
                    if (o != null && !done.contains(o.optString("id"))) keep.put(o);
                }
                p.edit().putString("queue", keep.toString()).apply();
            }
        }

        private JSONArray readQueue() {
            try {
                return new JSONArray(p.getString("queue", "[]"));
            } catch (JSONException e) {
                return new JSONArray();
            }
        }

        private static JSONArray trim(JSONArray q) {
            if (q.length() <= MAX_QUEUE) return q;
            JSONArray out = new JSONArray();
            for (int i = q.length() - MAX_QUEUE; i < q.length(); i++) out.put(q.opt(i));
            return out;
        }
    }
}
