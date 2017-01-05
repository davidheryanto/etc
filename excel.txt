# Remove line breaks in cell
# http://www.excelblog.ca/remove-line-breaks-from-excel-cell/
Find and Replace: 'Alt+010' with ' '

# Unmerge cells and fill
# http://www.extendoffice.com/documents/excel/1139-excel-unmerge-cells-and-fill.html
Home > Find & Select > Go To Special: Blanks
Type = and then select the cell source

# Password protect all .xls in a folder
# http://excel.tips.net/T002878_Protecting_an_Entire_Folder_of_Workbooks.html
Sub ProtectAll()
    Dim wBk As Workbook
    Dim sFileSpec As String
    Dim sPathSpec As String
    Dim sFoundFile As String

    sPathSpec = "C:\MyPath\"
    sFileSpec = "*.xls"

    sFoundFile = Dir(sPathSpec & sFileSpec)
    Do While sFoundFile <> ""
        Set wBk = Workbooks.Open(sPathSpec & sFoundFile)
        With wBk
            Application.DisplayAlerts = False
            wBk.SaveAs FileName:=.FullName, _
              Password:="swordfish"
            Application.DisplayAlerts = True
        End With
        Set wBk = Nothing
        Workbooks(sFoundFile).Close False
        sFoundFile = Dir
    Loop
End Sub