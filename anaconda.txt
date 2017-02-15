# http://davebehnke.com/using-python-anaconda-distribution.html

conda info -e
conda info --all

conda create -h
conda create -n python3 python=3.3 ipython-notebook pip numpy

source activate python3
source deactivate

conda search "^python$"
conda remove flask

# https://github.com/ContinuumIO/anaconda-issues/issues/368
ImportError: /lib64/libpangoft2-1.0.so.0: undefined symbol: FcWeightToOpenType
conda install -c asmeurer pango
