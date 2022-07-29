# edumeet-SIPGW
# prerequisites for canvas render headless browser

sudo pip3 install selenium                                                                                        
                                                                                                         
sudo apt install firefox.                                                                                           
OR                                                                                                                
wget https://ftp.mozilla.org/pub/firefox/releases/99.0/linux-x86_64/hu/firefox-99.0.tar.bz2                         
                                                                                                                    
gechodriver on debian:
https://github.com/mozilla/geckodriver/releases.                                               
OR                                                                                                                
sudo apt install firefox-geckodriver                                                                                
                                          
# to run                                          

docker build -t ffgw .                                                                                              
docker run -d --name testroom --log-driver=journald --env URL=https://sipgw.example.com ffgw:latest 
docker run --name testroom --log-driver=journald --env URL=https://192.168.0.1:4443/?callid=tesztgw-1019 ffgw:latest  