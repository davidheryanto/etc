Error:
/lib64/libpangoft2-1.0.so.0: undefined symbol: FcWeightToOpenType 

Cause:
Fedora 22 use more recent version of fontconfig (2.11.94) than the one provided by Anaconda (2.11.1)

Fix:
conda install -c asmeurer pango

Reference:
https://groups.google.com/a/continuum.io/forum/#!topic/anaconda/2b696RjVhDg

Error:
ProM cannot retrieve packages behind proxy

Fix:
Edit the .ini and .bat files, add this option
-Dhttp.proxyHost=remote.proxy.com -Dhttp.proxyPort=8080

Reference:
http://www.promtools.org/doku.php?id=prom641:troubleshooting
