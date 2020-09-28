FROM balenalib/raspberry-pi-debian-node:latest-jessie

RUN apt-get update && apt-get install -y build-essential psmisc ifupdown omxplayer x11-xserver-utils xserver-xorg libraspberrypi0 libraspberrypi-dev raspberrypi-kernel-headers cec-utils libpng12-dev git-core wget --no-install-recommends && apt-get clean && rm -rf /var/lib/apt/*

RUN rm -f /etc/localtime && ln -s /usr/share/zoneinfo/America/New_York /etc/localtime

RUN git clone https://github.com/AndrewFromMelbourne/raspi2png /usr/src/app/raspi2png && cd /usr/src/app/raspi2png && make && make install && rm -rf /usr/src/app/raspi2png

COPY util/X.service /etc/systemd/system/X.service
COPY . /usr/src/app
RUN cd /usr/src/app && npm install && npm cache clean --force
RUN cd /usr/src/app && rm -rf util

ENV INITSYSTEM on

CMD ["node", "/usr/src/app/app.js"]
