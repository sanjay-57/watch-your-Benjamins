package app.watchyourbenjamins;

import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * The folder the user picked for automatic backups (Storage Access Framework, so no storage
 * permission). Files are named benjamins-auto-YYYY-MM-DD.json; the newest {@link #KEEP} are kept.
 */
final class BackupFolder {
    static final String PREFIX = "benjamins-auto-";
    static final int KEEP = 10;

    private BackupFolder() {
    }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences("wyb_backup", Context.MODE_PRIVATE);
    }

    static Uri tree(Context c) {
        String s = prefs(c).getString("tree", null);
        return s == null ? null : Uri.parse(s);
    }

    static void save(Context c, Uri tree) {
        prefs(c).edit().putString("tree", tree.toString()).apply();
    }

    static void clear(Context c) {
        prefs(c).edit().remove("tree").apply();
    }

    static Uri rootDoc(Uri tree) {
        return DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
    }

    /** Human-readable folder name, or null if the folder is gone. */
    static String name(Context c, Uri tree) {
        try (Cursor q = c.getContentResolver().query(rootDoc(tree),
                new String[]{DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
            if (q != null && q.moveToFirst()) return q.getString(0);
        } catch (RuntimeException ignored) {
        }
        return null;
    }

    /** Writes one backup and prunes old ones; returns the created file's name. */
    static String write(Context c, String name, String content) throws IOException {
        Uri tree = tree(c);
        if (tree == null) throw new IOException("no backup folder chosen");
        Uri doc;
        try {
            doc = DocumentsContract.createDocument(c.getContentResolver(), rootDoc(tree), "application/json", name);
        } catch (RuntimeException e) {
            throw new IOException("folder unavailable", e);
        }
        if (doc == null) throw new IOException("can't create a file in that folder");
        try (OutputStream os = c.getContentResolver().openOutputStream(doc, "wt")) {
            if (os == null) throw new IOException("can't write to that folder");
            os.write(content.getBytes(StandardCharsets.UTF_8));
        }
        prune(c, tree);
        return name;
    }

    private static void prune(Context c, Uri tree) {
        try {
            Uri kids = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
            List<String[]> mine = new ArrayList<>(); // {displayName, documentId}
            try (Cursor q = c.getContentResolver().query(kids, new String[]{
                    DocumentsContract.Document.COLUMN_DISPLAY_NAME, DocumentsContract.Document.COLUMN_DOCUMENT_ID}, null, null, null)) {
                while (q != null && q.moveToNext()) {
                    String n = q.getString(0);
                    if (n != null && n.startsWith(PREFIX) && n.endsWith(".json")) mine.add(new String[]{n, q.getString(1)});
                }
            }
            Collections.sort(mine, (a, b) -> b[0].compareTo(a[0])); // newest date first
            for (int i = KEEP; i < mine.size(); i++) {
                DocumentsContract.deleteDocument(c.getContentResolver(), DocumentsContract.buildDocumentUriUsingTree(tree, mine.get(i)[1]));
            }
        } catch (Exception ignored) {
            // pruning is best-effort; a failed clean-up must never fail the backup itself
        }
    }
}
