package app.watchyourbenjamins;

import java.math.BigDecimal;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads Indian Overseas Bank UPI alerts. Pure Java (no Android types) so it can be unit-tested.
 *
 * <p>Deliberately strict: a message is only accepted when it comes from an IOB sender id, is a
 * UPI debit (or, when the user allows it, a UPI credit), and the account it names ends with the
 * configured last digits. Anything else (other banks, other accounts, OTPs, promotions) is
 * rejected and never stored.
 */
final class IobSms {
    enum Status { OK, NOT_IOB, NOT_UPI, CREDIT_OFF, OTHER_ACCOUNT, NO_AMOUNT }

    enum Kind { DEBIT, CREDIT }

    static final class Result {
        final Status status;
        final Kind kind;
        final long paise;
        final String ref;
        final String toLast4;

        Result(Status status, Kind kind, long paise, String ref, String toLast4) {
            this.status = status;
            this.kind = kind;
            this.paise = paise;
            this.ref = ref;
            this.toLast4 = toLast4;
        }
    }

    private static final Pattern DEBIT = Pattern.compile("\\bdebit(?:ed)?\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern CREDIT = Pattern.compile("\\bcredit(?:ed)?\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern UPI = Pattern.compile("\\bUPI\\b", Pattern.CASE_INSENSITIVE);
    // "a/c no. XXXXXX1234", "A/c XX1234", "account no 1234" …
    private static final Pattern ACCT = Pattern.compile(
            "\\b(?:a/?c|account)\\b\\.?\\s*(?:no\\.?|number)?\\s*:?\\s*([Xx*]*\\d+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern AMOUNT = Pattern.compile(
            "(?:\\bRs\\.?|\\bINR|\u20B9)\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)", Pattern.CASE_INSENSITIVE);
    private static final Pattern REF = Pattern.compile(
            "\\bref(?:erence)?\\.?\\s*(?:no\\.?|number|id)?\\s*[:\\-]?\\s*(\\d{6,})", Pattern.CASE_INSENSITIVE);
    private static final Pattern TO_ACCT = Pattern.compile(
            "\\bcredited\\s+to\\s+(?:a/?c|account)\\b\\.?\\s*(?:no\\.?|number)?\\s*:?\\s*[Xx*]*(\\d{3,})", Pattern.CASE_INSENSITIVE);

    private IobSms() {
    }

    /** Sender ids look like "AD-IOBCHN-S", "VM-IOBSMS", "IOBCHN". */
    static boolean fromIob(String address) {
        return address != null && address.toUpperCase(Locale.ROOT).contains("IOB");
    }

    /** Keeps digits only and returns the last four ("" if there are fewer than four). */
    static String cleanLast4(String s) {
        String d = s == null ? "" : s.replaceAll("\\D", "");
        return d.length() < 4 ? "" : d.substring(d.length() - 4);
    }

    static Result parse(String address, String body, String last4, boolean allowCredit) {
        if (!fromIob(address)) return reject(Status.NOT_IOB);
        if (body == null || last4 == null || last4.length() != 4) return reject(Status.NOT_UPI);

        // A debit alert says "debited … credited to a/c …" (debit comes first), a credit alert
        // only or first says "credited".
        Matcher d = DEBIT.matcher(body);
        Matcher c = CREDIT.matcher(body);
        boolean hasD = d.find(), hasC = c.find();
        if (!hasD && !hasC) return reject(Status.NOT_UPI);
        Kind kind = hasD && (!hasC || d.start() < c.start()) ? Kind.DEBIT : Kind.CREDIT;
        if (!UPI.matcher(body).find()) return reject(Status.NOT_UPI);
        if (kind == Kind.CREDIT && !allowCredit) return reject(Status.CREDIT_OFF);

        // The first account named is the one that was debited/credited: it must be the user's.
        Matcher a = ACCT.matcher(body);
        if (!a.find() || !a.group(1).endsWith(last4)) return reject(Status.OTHER_ACCOUNT);

        Matcher m = AMOUNT.matcher(body);
        if (!m.find()) return reject(Status.NO_AMOUNT);
        long paise;
        try {
            paise = new BigDecimal(m.group(1).replace(",", "")).movePointRight(2).longValueExact();
        } catch (ArithmeticException | NumberFormatException e) {
            return reject(Status.NO_AMOUNT);
        }
        if (paise <= 0) return reject(Status.NO_AMOUNT);

        Matcher r = REF.matcher(body);
        Matcher t = TO_ACCT.matcher(body);
        String toLast4 = kind == Kind.DEBIT && t.find() ? lastFour(t.group(1)) : "";
        return new Result(Status.OK, kind, paise, r.find() ? r.group(1) : "", toLast4);
    }

    private static String lastFour(String digits) {
        return digits.length() <= 4 ? digits : digits.substring(digits.length() - 4);
    }

    private static Result reject(Status s) {
        return new Result(s, Kind.DEBIT, 0, "", "");
    }
}
