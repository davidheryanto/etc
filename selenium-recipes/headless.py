# https://intoli.com/blog/running-selenium-with-headless-chrome/

from selenium import webdriver


if __name__ == "__main__":
    options = webdriver.ChromeOptions()
    options.add_argument("headless")
    options.add_argument("remote-debugging-port=9222")
    driver = webdriver.Chrome(options=options)
    driver.get("https://cnn.com")
    driver.implicitly_wait(10)
    # You can set a breakpoint here, and open the browser at localhost:9022 
    # Inspect the currently accesed page or click around
    driver.get_screenshot_as_file("screenshot.png")