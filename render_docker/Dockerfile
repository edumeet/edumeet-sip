FROM ubuntu:18.04                                                                                                   
                                                                                                                    
RUN  apt-get update \                                                                                               
  && apt-get install -y wget python3 python3-pip firefox firefox-geckodriver\                                       
  && rm -rf /var/lib/apt/lists/*                                                                                    
                                                                                                                    
RUN pip3 install selenium                                                                                           
                                                                                                                    
ADD ff_sip/ /usr/local/bin                                                                                         
                                                                                                                    
CMD ["/usr/bin/python3", "-u", "/usr/local/bin/ff_start.py"]                                                        
                                                                   