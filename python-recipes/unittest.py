import unittest


class MyTestCase(unittest.TestCase):
    
    def tearDown(self):
        super(MyTestCase, self).tearDown()

    def setUp(self):
        super(MyTestCase, self).setUp()

    def test_something(self):
        self.assertEqual(True, False)


if __name__ == '__main__':
    unittest.main()