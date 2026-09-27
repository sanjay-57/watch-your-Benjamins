# Benjamins release signing key — BACK THIS UP

This folder holds the key that signs every release APK of Benjamins (`app.watchyourbenjamins`):

| File | What it is |
|---|---|
| `benjamins-release.jks` | PKCS12 keystore, alias `benjamins`, RSA 4096, valid 10000 days (until 2054), `CN=Benjamins` |
| `keystore.properties` | store/key password (identical — PKCS12 uses one password), read by `app/build.gradle` |

Both files are git-ignored on purpose. **Back them up now** (password manager / encrypted
drive, at least two places).

**Why it matters:** Android only installs an update over an existing app if it is signed with
the **same key**. If this key is lost or regenerated, users cannot update — they must uninstall
first, which **deletes all their locally stored expense data** (everything lives on the phone).
The same applies to Google Play unless you enrol in Play App Signing with this key as the
upload key.

Certificate fingerprint (to check you have the right key):

```
SHA-256: 5D:91:F0:BE:7B:45:C9:12:67:BF:A0:6D:23:B9:07:06:12:F4:26:97:CD:FE:56:14:B1:5E:8B:3C:3F:47:FF:BA
```

Check a keystore or an APK:

```sh
keytool -list -v -keystore benjamins-release.jks          # asks for the password
$ANDROID_HOME/build-tools/36.0.0/apksigner verify --print-certs ../../releases/Benjamins-v1.0.0.apk
```

Never run `keytool -genkeypair` here again for an app that is already in users' hands.
