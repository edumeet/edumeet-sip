from selenium.webdriver.firefox.options import Options as FirefoxOptions                                            
from selenium import webdriver                                                                                      
from threading import Event                                                                                         
import os                                                                                             

options = FirefoxOptions()                                                                                          
options.AcceptInsecureCertificates = True                                                                           
                                                                                                                    
options.add_argument("--headless")                                                                                  
driver = webdriver.Firefox(options=options)                                                                         
                                                                                                                    
print('SIP/EDUMEET gw is starting...')                                                                              
print('OPEN: ' + os.getenv('URL'))                                                                                  
driver.get(os.getenv('URL'))                                                                                        
                                                                                                                    
#input("Press Enter to continue...")                                                                                
#driver.quit()                                                                                                      
Event().wait()