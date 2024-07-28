import * as sony from "sony-web";

const BLUETOOTH_SERVICE_ID = "96cc203e-5068-46ad-b32d-e316f5e069ba";

class PollableTimeout {
  #timeout;
  #abort;
  #abortPromise;

  /**
   * @param {number} delay
   */
  constructor(delay) {
    if (delay > -1) {
      this.#timeout = new Promise((resolve) => setTimeout(resolve, delay));
    } else {
      this.#timeout = null;
    }

    const self = this;
    this.#abortPromise = new Promise((resolve, _reject) => {
      self.#abort = resolve;
    });
  }

  /**
   * @returns {Promise}
   */
  get future() {
    return Promise.race(
      this.#timeout != null
        ? [this.#timeout, this.#abortPromise]
        : [this.#abortPromise],
    );
  }

  abortWait() {
    console.info("abort");
    this.#abort();
  }
}

class Device {
  #onUpdateListener = null;

  /**
   * @param {SerialPort} port
   */
  constructor(port) {
    this.port = port;
    this.protocol = new sony.SonyHeadphone();
    this.isClosed = false;
    this.poll = new PollableTimeout(0);
    this.loops = Promise.all([this.read(), this.runLoop()]);
  }

  setOnUpdateListener(callback) {
    this.#onUpdateListener = callback;
  }

  async read() {
    const reader = this.port.readable.getReader();

    while (true) {
      let { value, done } = await reader.read();
      if (done) {
        break;
      }

      console.debug("new packet");

      this.protocol.parse_packet(value);
      this.poll.abortWait();
    }

    this.isClosed = true;
    reader.releaseLock();
  }

  async runLoop() {
    const writer = this.port.writable.getWriter();

    while (!this.isClosed) {
      console.log("awaiting net");
      await this.poll.future;
      var result = this.protocol.poll();

      do {
        console.debug(result.action_type, result.data);
        switch (result.action_type) {
          case sony.ActionType.Send:
            console.debug("sending data");
            await writer.write(result.data);
            break;
          case sony.ActionType.Wait:
            this.poll = new PollableTimeout(
              result.data != null ? Number(result.data) : -1,
            );
            break;
          case sony.ActionType.RefreshUi:
            if (this.#onUpdateListener != null) {
              this.#onUpdateListener(this);
            }
            break;
          case sony.ActionType.PollAgain:
            break;
          default:
            console.warn("unknown action", result);
            break;
        }

        result = this.protocol.poll();
      } while (result.action_type != sony.ActionType.Wait);
    }
    writer.releaseLock();
  }

  get deviceBattery() {
    if (this.protocol.battery_device == null) {
      return null;
    } else if (
      this.protocol.battery_device instanceof sony.SingleDeviceBattery
    ) {
      return [this.protocol.battery_device.level];
    } else {
      return [
        this.protocol.battery_device.left,
        this.protocol.battery_device.right,
      ];
    }
  }

  get caseBattery() {
    if (this.protocol.battery_case == null) {
      return null;
    } else {
      return this.protocol.battery_case.level;
    }
  }

  get ancState() {
    if (this.protocol.anc_state != null) {
      return this.protocol.anc_state;
    }
    return null;
  }

  toggleAnc() {
    this.protocol.change_anc_mode();
    this.poll.abortWait();
  }
}

export { Device, BLUETOOTH_SERVICE_ID, sony };
