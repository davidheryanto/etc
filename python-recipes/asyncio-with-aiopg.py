import asyncio

import aiohttp
import aiopg
import async_timeout
import psycopg2
from bs4 import BeautifulSoup


async def fetch(session, url):
    with async_timeout.timeout(10):
        async with session.get(url) as response:
            return await response.text()


async def main(loop, i):
    async with aiohttp.ClientSession(loop=loop) as session:
        try:
            print(i)
            html = await fetch(session, 'http://google.com')
            print(f'{i}...')
            clean_text = [BeautifulSoup(html, 'lxml').text]

            dsn = "dbname='MYDB' user='MYUSER' host='MY_IP' password='MYPASS'"
            async with aiopg.connect(dsn) as conn:
                async with conn.cursor() as cur:
                    sql = "INSERT INTO delete_me (response) VALUES (%s)"
                    await cur.execute(sql, clean_text)
                conn.commit()

        except aiohttp.client_exceptions.ClientConnectionError as e:
            print('>>>>> Connection Error')
            print(e)
        except asyncio.TimeoutError as e:
            print('!!!!! Timeout Error')
        except psycopg2.Error as e:
            print('##### DB Connection Error')
            print(type(e))
            print(e)


loop = asyncio.get_event_loop()
tasks = [asyncio.ensure_future(main(loop, i)) for i in range(5)]
gathered_task = asyncio.gather(*tasks)
loop.run_until_complete(gathered_task)
