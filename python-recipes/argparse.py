# http://stackoverflow.com/questions/7427101/dead-simple-argparse-example-wanted-1-argument-3-results

parser = argparse.ArgumentParser()
parser.add_argument('-f', '--my-foo', help='Description for foo argument', 
	default='foobar')
parser.add_argument('-b', '--bar-value', default=3.14, required=True)
args = parser.parse_args()

args = parser.parse_args()
print args.my_foo  # - is converted into _
print args.bar_value

# Store flags: yes/no
parser.add_argument('--foo', action='store_true')
parser.add_argument('--no-foo', action='store_false')

if (args.foo):
    print "foo is true"

if (args.no_foo is False):
    print "nofoo is false"

# Required
parser.add_argument('-o', '--output', required=True)

# Convert to dict
args = parser.parse_args()
argsdict = vars(args)
print argsdict['my_foo']
print argsdict['bar_value']