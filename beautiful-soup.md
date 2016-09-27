import requests
from bs4 import BeautifulSoup

# Setup proxy
_proxy = 'http://remote.proxy.com:8080'
proxy = {'http':_proxy,'https':_proxy}

url = 'http://www.nationsonline.org/oneworld/country_code_list.htm'
resp = requests.get(url,proxies=proxy)
soup = BeautifulSoup(resp.text)

soup.find_all(attrs={"data-foo": "value"})
soup.find_all(id='foo')