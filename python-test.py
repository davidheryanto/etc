# Mock a method so another method that depends on that method can be tested
mocked_value = "VALUE"
with mock.patch("os.getenv") as getenv:
    getenv.return_value = mocked_value
    # Call another method that that depends on os.getenv(KEY)
    # ....
    # Test that getenv is actually called with corect key
    getenv.assert_called_once_with(KEY)