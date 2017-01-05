# Wildcard col / row name 
http://stackoverflow.com/questions/8174582/does-r-have-a-wildcard-expresion-aka

# Examples
- getwd(), setwd(), list.files()
- download.file(url, destfile = './house-idaho.csv', method='curl')
- nrow()
- houseData <- read.table('data.csv')
- df[df$aged <= df$len, ] # Filter
  subset(df, aged <= len)
- View(houseData)
- df[,c("A","B","E")]  # View column named A,B, E
- df[c(1, 3), 3:6]
- gasData[1:10, 1:3]  # row 1-10, column 1-3
- typeof(myVariable)
- strsplit(text, split=' ')

# Library path environment variable
R_LIBS_USER

# Essential packages
# https://www.r-bloggers.com/10-r-packages-every-data-scientist-should-know-about/
- sqldf (for selecting from data frames using SQL)
- forecast (for easy forecasting of time series)
- plyr (data aggregation)
- stringr (string manipulation)
- Database connection packages RPostgreSQL, RMYSQL, RMongo, RODBC, RSQLite
- lubridate (time and date manipulation)
- ggplot2 (data visulization)
- qcc (statistical quality control and QC charts)
- reshape2 (data restructuring)
- randomForest (random forest predictive models)

# Creating packages
https://hilaryparker.com/2014/04/29/writing-an-r-package-from-scratch/