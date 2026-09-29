package app.watchyourbenjamins;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import org.json.JSONObject;

/**
 * Home-screen widget: today's safe-to-spend and the balance, plus a one-tap "+ Add". The text is
 * formatted by the web app (it knows the currency and the privacy setting) and pushed through
 * {@code WYBNative.setWidgetData}; this class only displays it.
 */
public final class WidgetProvider extends AppWidgetProvider {
    private static final String PREFS = "wyb_widget";

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) update(context, mgr, id);
    }

    /** Called after the page pushes new numbers. */
    static void publish(Context context, String json) {
        context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("data", json).apply();
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        for (int id : mgr.getAppWidgetIds(new ComponentName(context, WidgetProvider.class))) update(context, mgr, id);
    }

    private static void update(Context c, AppWidgetManager mgr, int id) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String title = "Watch your Benjamins", main = "Open the app", sub = "";
        try {
            JSONObject o = new JSONObject(p.getString("data", "{}"));
            title = o.optString("title", title);
            main = o.optString("main", main);
            sub = o.optString("sub", sub);
        } catch (Exception ignored) {
        }
        RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.widget);
        rv.setTextViewText(R.id.widget_title, title);
        rv.setTextViewText(R.id.widget_main, main);
        rv.setTextViewText(R.id.widget_sub, sub);
        rv.setViewVisibility(R.id.widget_sub, sub.isEmpty() ? android.view.View.GONE : android.view.View.VISIBLE);
        int flags = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
        rv.setOnClickPendingIntent(R.id.widget_root,
                PendingIntent.getActivity(c, 10, new Intent(c, MainActivity.class), flags));
        rv.setOnClickPendingIntent(R.id.widget_add,
                PendingIntent.getActivity(c, 11, new Intent(c, MainActivity.class).setAction(MainActivity.ACTION_ADD), flags));
        mgr.updateAppWidget(id, rv);
    }
}
