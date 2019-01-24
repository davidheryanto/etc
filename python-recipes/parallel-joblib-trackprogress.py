# https://stackoverflow.com/questions/24983493/tracking-progress-of-joblib-parallel-execution

from joblib import Parallel, delayed
import time
from tqdm import tqdm

def myfun(x):
    time.sleep(3)
    return x**2

results = Parallel(n_jobs=8)(delayed(myfun)(i) for i in tqdm(range(24)))