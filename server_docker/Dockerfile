FROM node:20

RUN mkdir /opt/edumeet-sip

ADD edumeet-sip/ /opt/edumeet-sip

WORKDIR /opt/edumeet-sip

RUN apt update && apt install -y curl git ca-certificates gnupg python3 python3-pip build-essential redis openssl libssl-dev pkg-config libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev


RUN npm install

RUN npm run build

RUN npm install -g serve@13.0.4

CMD ["serve", "-s", "build"]
