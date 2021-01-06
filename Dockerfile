FROM balenalib/raspberry-pi-debian-node:latest-jessie

ARG TIMEZONE=America/New_York

RUN apt-get update && apt-get install -y build-essential psmisc ifupdown omxplayer x11-xserver-utils xserver-xorg libraspberrypi0 libraspberrypi-dev raspberrypi-kernel-headers cec-utils libpng12-dev wget --no-install-recommends && apt-get clean && rm -rf /var/lib/apt/*

RUN rm -f /etc/localtime && ln -s /usr/share/zoneinfo/$TIMEZONE /etc/localtime

COPY ./raspi2png/ /tmp/raspi2png/

RUN cd /tmp/raspi2png && make && make install && rm -rf /usr/src/app/raspi2png

COPY util/X.service /etc/systemd/system/X.service
COPY . /usr/src/app
RUN cd /usr/src/app && npm install && npm cache clean --force
RUN cd /usr/src/app && rm -rf util

ENV INITSYSTEM on

HEALTHCHECK --interval=1m --timeout=5s CMD wget --http-user=$APP_LOGIN_USERNAME --http-password=$APP_LOGIN_PASSWORD_HASH --no-verbose --tries=1 --spider http://localhost/ || exit 1
CMD ["node", "/usr/src/app/app.js"]
