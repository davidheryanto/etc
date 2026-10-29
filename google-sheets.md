# Google Sheets cheatsheet

## Match multiple values

<https://webapps.stackexchange.com/questions/107284/how-do-i-make-the-text-contains-evaluate-multiple-values-in-google-spreadsheet>

```
=match(A1,{"blue","green","orange","red","white"},0)
=regexmatch(A1,"blue|green|orange|red|white")
```

## SGX share price from growbeansprout.com

For SGX symbols `GOOGLEFINANCE()` doesn't return a price, so scrape it from
growbeansprout.com instead. `A1` holds a symbol like `SGX:D05` or `NASDAQ:NFLX`; SGX
tickers map to `<code>.SI` on the site, everything else goes to `GOOGLEFINANCE()`.

```
=IF(LEFT(A1,4)="SGX:",
  IFERROR(IMPORTXML("https://growbeansprout.com/quote/"&MID(A1,5,10)&".SI",
                    "//p[@class='h1']"), ""),
  IFERROR(GOOGLEFINANCE(A1,"price"), "")
)
```

### When the SGX cells go blank

`IFERROR` hides whatever went wrong, so first remove it from one failing cell to see the
real error. `#N/A` "Imported content is empty" usually means the site renamed the CSS class
around the price. Find the current class:

```bash
curl -fsSL -A "Mozilla/5.0" https://growbeansprout.com/quote/D05.SI \
  | grep -o '<p class="[^"]*">[0-9.]*</p>'
```

It prints e.g. `<p class="h1">73.950</p>`; put that class into the XPath. If it prints
nothing, the markup changed shape too; look around the price in the page source. Observed in
Oct 2026: the class changed from `text-3xl font-medium` to `h1`.

## Change text inside formulas across a sheet

To update the same string in many formulas, e.g. the XPath class above:

1. **Ctrl+H**.
2. **Find** `text-3xl font-medium`, **Replace with** `h1`.
3. **Search**: This sheet (or a specific range).
4. Tick **Also search within formulae**; leave regular expressions and match entire cell
   contents unticked.
5. **Replace all**. It reports how many instances it replaced.

- Only the matched text changes, so each row keeps its own cell references.
- Safer than copy-paste or fill-down when a filter hides rows.
- With formula search ticked, Sheets showed formulas instead of values while the dialog was
  open; values came back on **Done**.
