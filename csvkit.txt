https://csvkit.readthedocs.org/en/0.9.1/

in2csv data.xls > data.csv
in2csv data.json > data.csv
csvjson data.csv > data.json

csvcut -n data.csv  # Print col names
csvcut -c column_a,column_c data.csv > new.csv  # Select subset col
csvcut -c column_c,column_a data.csv > new.csv  # Reorder col

csvcut -c county,item_name,quantity data.csv | csvlook | head

# Find rows with mactching cell
csvgrep -c phone_number -r 555-555-\d{4}" data.csv > matching.csv

csvstat data.csv  # Summary

# SQL query
csvsql --query "select name from data where age > 30" data.csv > old_folks.csv