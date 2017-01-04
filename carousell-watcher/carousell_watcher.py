# coding=utf-8

from __future__ import print_function

import cPickle
import datetime
import json
import os
import random
import time
import urllib

import requests
from bs4 import BeautifulSoup

search_term = 'dell ultrasharp'
search_url = 'https://sg.carousell.com/search/products?query={}&sort=recent'.format(urllib.quote(search_term))
search_frequency_minutes = 5

ifttt_event = 'carousell'
ifttt_key = '{REPLACE WITH IFTTT MAKER KEY}'
ifttt_url = 'https://maker.ifttt.com/trigger/{event}/with/key/{key}'.format(
    event=ifttt_event, key=ifttt_key)


def get_text(elem):
    if elem:
        return elem.text
    else:
        return ''


def run():
    # Load previous saved items if exists
    data_path = search_term.replace(' ', '_') + '.dat'
    if os.path.isfile(search_term + '.dat'):
        with open(data_path, 'rb') as fp:
            product_set = cPickle.load(fp)
    else:
        product_set = set()

    while True:
        print('{time} GET  {url}'.format(time=datetime.datetime.now().isoformat(), url=search_url))
        req = requests.get(search_url)
        html_content = req.content
        soup = BeautifulSoup(html_content, 'html.parser')

        n_new_item = 0
        for product_elem in soup.find_all(class_='pdt-card'):
            product = {}
            product_property_to_class = {
                'title': 'pdt-card-title',
                'price': 'pdt-card-price',
                'posted': 'pdt-card-timeago'
            }
            for property, product_class in product_property_to_class.items():
                product[property] = get_text(product_elem.find(class_=product_class))
            # Posted here keeps changing like 2h ago, 3h ago. Maybe if we can find posted datetime, we can include it
            # in frozenset.
            product_frozen = frozenset((k, v) for k, v in product.items() if k != 'posted')
            if product_frozen not in product_set:
                product_set.add(product_frozen)
                n_new_item += 1
                if n_new_item <= 3:
                    payload = u'{title}, {price}, {posted}'.format(**product)
                    print('{time} POST {url}'.format(time=datetime.datetime.now().isoformat(), url=ifttt_url))
                    requests.post(ifttt_url, data=json.dumps({'value1': payload}),
                                  headers={'Content-Type': 'application/json'})

        n_new_item_left = n_new_item - 3
        if n_new_item_left > 0:
            print('{time} POST {url}'.format(time=datetime.datetime.now().isoformat(), url=ifttt_url))
            requests.post(ifttt_url, data=json.dumps({'value1': str(n_new_item_left) + ' other new items'}),
                          headers={'Content-Type': 'application/json'})

        with open(data_path, 'wb') as fp:
            cPickle.dump(product_set, fp)
        # Randomize waiting time a bit
        time.sleep(search_frequency_minutes * random.randrange(50, 71))


if __name__ == '__main__':
    run()
