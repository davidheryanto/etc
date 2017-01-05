# Curl with cookie and header 
curl -v --cookie "cookieName=cookieValue" --header "Accept-Language: en" --header "X-Forwarded-For: 123.123.123.123" "http://localhost:8080/somepage"