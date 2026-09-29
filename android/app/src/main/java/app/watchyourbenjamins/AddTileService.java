package app.watchyourbenjamins;

import android.app.PendingIntent;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

/** Quick Settings tile: pull down, tap "Add expense", the add sheet opens. */
public final class AddTileService extends TileService {
    @Override
    public void onStartListening() {
        Tile t = getQsTile();
        if (t == null) return;
        t.setLabel(getString(R.string.tile_label));
        t.setIcon(Icon.createWithResource(this, R.drawable.ic_tile_add));
        t.setState(Tile.STATE_INACTIVE);
        t.updateTile();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onClick() {
        Intent i = new Intent(this, MainActivity.class).setAction(MainActivity.ACTION_ADD).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (android.os.Build.VERSION.SDK_INT >= 34) {
            startActivityAndCollapse(PendingIntent.getActivity(this, 12, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        } else {
            startActivityAndCollapse(i);
        }
    }
}
