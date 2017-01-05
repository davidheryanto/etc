# Draw circle
plt.scatter(x, y, s=80, facecolors='none', edgecolors='r')

# Set default size
# http://stackoverflow.com/questions/17230797/how-to-set-the-matplotlib-figure-default-size-in-ipython-notebook
pylab.rcParams['figure.figsize'] = (10.0, 8.0)

# Set title to figure
pyplot.suptitle

# Plot different color with colormaps
# http://stackoverflow.com/questions/4805048/how-to-get-different-colored-lines-for-different-plots-in-a-single-figure
colormap = plt.cm.gist_ncar
plt.gca().set_color_cycle([colormap(i) for i in np.linspace(0, 0.9, num_plots)])

# Hide ticks on x-axis and y-axis
plt.gca().set_xticklabels([])
plt.gca().set_yticklabels([])

# Plot with legend
line_up = plt.plot([1,2,3], label='Line 2')
line_down = plt.plot([3,2,1], label='Line 1')
plt.legend(loc='upper left')

# Get color ranges: http://matplotlib.org/users/colormaps.html
cmap = matplotlib.cm.get_cmap('Spectral')  # Try brg
[matplotlib.colors.rgb2hex(cmap(coltone)) 
  for coltone in np.linspace(0, 1, num=xm2_n_clusters)]