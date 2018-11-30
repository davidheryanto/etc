# Reference: https://stackoverflow.com/questions/22615475/flask-application-with-background-threads/39008301#39008301

from concurrent.futures import ThreadPoolExecutor
from time import sleep

from flask import Flask, request
from random import randrange

executor = ThreadPoolExecutor(4)

app = Flask(__name__)

# Mapping of job_id -> status {'running', 'complete'}
# e.g. 1 -> 'running'
job_status = {}


@app.route('/execute_long_running_job')
def run_jobs():
    job_id = str(randrange(0, 10000))
    executor.submit(some_long_task, job_id)
    job_status[job_id] = 'Running'
    return 'job_id: ' + job_id + ' submitted'


@app.route('/job_status')
def status():
    job_id = request.args.get('job_id')
    return job_status[job_id]


def some_long_task(job_id):
    print("Task #1 started!")
    sleep(10)
    job_status[job_id] = 'Done'
    print("Task #1 is done!")


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')
