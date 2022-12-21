FROM node:14-buster-slim

RUN mkdir /opt/edumeet-sip

ADD edumeet-sip/ /opt/edumeet-sip

WORKDIR /opt/edumeet-sip

RUN npm install

RUN npm run build

RUN npm install -g serve@13.0.4

CMD ["serve", "-s", "build"]
