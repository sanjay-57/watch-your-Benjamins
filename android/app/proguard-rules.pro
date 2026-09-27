# WebView looks up bridge methods by name and requires the @JavascriptInterface
# annotation at runtime, so both the methods and the annotation must survive R8.
-keepattributes RuntimeVisibleAnnotations
-keepclassmembers class app.watchyourbenjamins.** {
    @android.webkit.JavascriptInterface public <methods>;
}
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
