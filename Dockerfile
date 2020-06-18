FROM balenalib/raspberry-pi-debian-node:latest-jessie
RUN apt-get update && apt-get install -y build-essential psmisc ifupdown omxplayer x11-xserver-utils xserver-xorg libraspberrypi0 libraspberrypi-dev raspberrypi-kernel-headers cec-utils libpng12-dev git-core && apt-get clean
RUN git clone https://github.com/AndrewFromMelbourne/raspi2png && cd raspi2png && make && make install
COPY . /usr/src/app
RUN cd /usr/src/app && npm install
COPY util/X.service /etc/systemd/system/X.service
ENV INITSYSTEM on
RUN rm -f /etc/localtime && ln -s /usr/share/zoneinfo/America/New_York /etc/localtime
CMD ["node", "/usr/src/app/app.js"]
