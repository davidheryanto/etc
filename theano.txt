# Return index like numpy where
http://stackoverflow.com/questions/20590909/returning-the-index-of-a-value-in-theano-vector

# Use OpenBLAS: .theanorc
[blas]
ldflags = -lopenblas

# vim ~/.theanorc
[global]
floatX = float32
device = gpu0
base_compiledir = ...

[nvcc]
fastmath = True

# Change location of .theanorc from /etc/theanorc to ~/.theanorc
THEANORC=/etc/theanorc:~/.theanorc