package app.watchyourbenjamins;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Read-only access to files in {@code cacheDir/share/} as
 * {@code content://<applicationId>.share/<name>}. Not exported: other apps can only open a
 * file through the temporary grant carried by the share intent (FLAG_GRANT_READ_URI_PERMISSION).
 */
public final class ShareProvider extends ContentProvider {
    private static final long MAX_AGE_MS = 24L * 60 * 60 * 1000;
    private static final Map<String, String> TYPES = Collections.synchronizedMap(new HashMap<>());

    /** Writes {@code data} to cacheDir/share/{@code name} and returns its content:// URI. */
    static Uri publish(Context context, String name, String mime, byte[] data) throws IOException {
        File dir = dir(context);
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("cannot create " + dir);
        File[] old = dir.listFiles();
        if (old != null) {
            long cutoff = System.currentTimeMillis() - MAX_AGE_MS;
            for (File f : old) {
                if (f.lastModified() < cutoff) //noinspection ResultOfMethodCallIgnored
                    f.delete();
            }
        }
        try (FileOutputStream os = new FileOutputStream(new File(dir, name))) {
            os.write(data);
        }
        TYPES.put(name, mime);
        return new Uri.Builder().scheme("content").authority(context.getPackageName() + ".share")
                .appendPath(name).build();
    }

    private static File dir(Context context) {
        return new File(context.getCacheDir(), "share");
    }

    private File fileFor(Uri uri) throws FileNotFoundException {
        String name = uri.getPathSegments().size() == 1 ? uri.getLastPathSegment() : null;
        if (name == null || name.equals("..") || name.equals(".")) throw new FileNotFoundException(uri.toString());
        File dir = dir(getContext());
        File f = new File(dir, name);
        try {
            if (!dir.getCanonicalFile().equals(f.getCanonicalFile().getParentFile()) || !f.isFile()) {
                throw new FileNotFoundException(uri.toString());
            }
        } catch (IOException e) {
            throw new FileNotFoundException(uri.toString());
        }
        return f;
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        File f;
        try {
            f = fileFor(uri);
        } catch (FileNotFoundException e) {
            return null;
        }
        if (projection == null) projection = new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
        ArrayList<String> cols = new ArrayList<>();
        ArrayList<Object> values = new ArrayList<>();
        for (String col : projection) {
            if (OpenableColumns.DISPLAY_NAME.equals(col)) {
                cols.add(col);
                values.add(f.getName());
            } else if (OpenableColumns.SIZE.equals(col)) {
                cols.add(col);
                values.add(f.length());
            }
        }
        MatrixCursor c = new MatrixCursor(cols.toArray(new String[0]), 1);
        c.addRow(values.toArray());
        return c;
    }

    @Override
    public String getType(Uri uri) {
        String name = uri.getLastPathSegment();
        if (name == null) return null;
        String type = TYPES.get(name);
        if (type != null) return type;
        int dot = name.lastIndexOf('.');
        if (dot >= 0) {
            type = MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substring(dot + 1).toLowerCase(Locale.ROOT));
        }
        return type != null ? type : "application/octet-stream";
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) throw new SecurityException("read-only");
        return ParcelFileDescriptor.open(fileFor(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }
}
