# Get Unix timestamp
Int32 unixTimestamp = (Int32)(DateTime.UtcNow.Subtract(new DateTime(1970, 1, 1))).TotalSeconds;

# Console Write multiple lines
# http://stackoverflow.com/questions/5821163/how-to-split-writeline-over-multiple-lines
Console.WriteLine(@"X
X
X");

# Publish standalone .exe with all the references
# http://stackoverflow.com/questions/189549/embedding-dlls-in-a-compiled-executable
Install-Package Costura.Fody
Install-CleanReferencesTarget