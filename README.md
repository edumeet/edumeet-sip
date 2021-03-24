# edumeet-SIPGW

A SIP gateway for [edumeet](https://github.com/edumeet/edumeet)

## Usage
1. Install newest docker & docker compose
2. create config `$ cp src/public/config/config.example.js src/public/config/config.js`
3. edit config `$ vim src/public/config/config.js`
    * `edumeetHostName`
    * `edumeetPort`
    * `roomMapping`
4. create sip gateway config `$ cp docker/freeswitch/conf/sip_profiles/external/provider.xml.example docker/freeswitch/conf/sip_profiles/external/provider.xml`
5. configure sip config `$ vim docker/freeswitch/conf/sip_profiles/external/provider.xml`
6. start with `$ UID=$(id -u) docker-compose up`

## Note
- can still be considered as a proof of concept
- this currently doesn't work behind NAT

## License

MIT