import org.joda.time.DateTime;
import org.joda.time.DateTimeZone;
import org.joda.time.format.DateTimeFormatter;
import org.joda.time.format.ISODateTimeFormat;

public class Scratch {
    public static void main(String[] args) {
        DateTimeFormatter dateTimeFormatter = ISODateTimeFormat.basicDateTimeNoMillis();
        System.out.println(DateTime.now().withZone(DateTimeZone.UTC).toString(dateTimeFormatter));
    }
}
