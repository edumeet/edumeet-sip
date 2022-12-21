FROM ubuntu:18.04                                                                                                   
                                                                                                                    
RUN  apt-get update \                                                                                               
  && apt-get install -y wget python3 python3-pip git ca-certificates fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release wget xdg-utils libgtk2.0-dev

RUN pip3 install cefpython3==66.0
RUN cd /root && git clone https://github.com/cztomczak/cefpython.git

                                                                                                                

CMD ["/usr/bin/python3", "/root/cefpython/examples/hello_world.py"]                                                        
                                                                   