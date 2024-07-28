import { Component, render } from "preact";
import { signal } from "@preact/signals";

import "./style.css";

import { Device, BLUETOOTH_SERVICE_ID, sony } from "./lib.js";

class App extends Component {
  #devices = signal([]);

  render(props, state, context) {
    return (
      <div>
        <section class="hero is-primary is-medium">
          <div class="hero-body">
            <div class="container has-text-centered">
              <p class="title">Sony Headphones</p>
            </div>
          </div>

          <div class="hero-foot">
            <nav class="tabs is-boxed is-fullwidth">
              <div class="container">
                <ul>
                  {this.#devices.value.length == 0 ? ( // TODO
                    <li class="is-active">
                      <a onClick={() => this.onConnectClick()}>Connect</a>
                    </li>
                  ) : (
                    this.#devices.value.map((d) => (
                      <li class="is-active">
                        <a>Device</a>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </nav>
          </div>
        </section>
        <section class="section">
          <div class="container">
            {this.#devices.value.length > 0 ? (
              <DeviceComponent device={this.#devices.value[0]} />
            ) : (
              <h1 class="title">No device</h1>
            )}
          </div>
        </section>
      </div>
    );
  }

  async onConnectClick() {
    const port = await navigator.serial.requestPort({
      allowedBluetoothServiceClassIds: [BLUETOOTH_SERVICE_ID],
    });

    await port.open({ baudRate: 9600 });
    console.log(this);
    this.#devices.value = [...this.#devices.value, new Device(port)];
  }
}

class DeviceComponent extends Component {
  constructor(props) {
    super();

    props.device.setOnUpdateListener(() => {
      this.setState({});
    });
  }

  render(props, state, context) {
    const device = props.device;
    const deviceBattery = device.deviceBattery;

    let batteries = [];
    if (deviceBattery != null) {
      if (deviceBattery.length == 1) {
        batteries.push({
          name: "Device",
          value: deviceBattery[0],
        });
      } else {
        batteries.push({
          name: "Left",
          value: deviceBattery[0],
        });
        batteries.push({
          name: "Right",
          value: deviceBattery[1],
        });
      }
    }

    if (device.caseBattery != null) {
      batteries.push({
        name: "Case",
        value: deviceBattery[0],
      });
    }

    let batteriesComponent = null;
    if (batteries != null) {
      batteriesComponent = (
        <div class="block">
          <label class="label">Device battery</label>
          <div class="grid">
            {batteries.map((c) => (
              <div class="cell">
                <div class="card">
                  <header class="card-header">
                    <p class="card-header-title">{c.name}</p>
                  </header>
                  <div class="card-content">
                    <div class="content">
                      <p>{c.value}%</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    let ancComponent = null;
    const ancState = device.ancState;
    if (ancState != null) {
      let state;
      switch (ancState.anc_mode) {
        case sony.AncMode.Off:
          state = "AncMode : Off";
          break;
        case sony.AncMode.On:
          state = "AncMode : On";
          break;
        case sony.AncMode.AmbiantMode:
          state = "AncMode: AmbianMode"; // TODO Level
          break;
        case sony.AncMode.Wind:
          state = "AncMode : Wind";
          break;
      }
      ancComponent = (
        <div class="block">
          <div class="card">
            <header class="card-header">
              <p class="card-header-title">Anc State</p>
            </header>
            <div class="card-content">
              <div class="content">{state}</div>
            </div>
            <footer class="card-footer">
              <a class="card-footer-item" onClick={() => device.toggleAnc()}>
                Change
              </a>
            </footer>
          </div>
        </div>
      );
    }

    return (
      <div>
        {batteriesComponent}
        {ancComponent}
      </div>
    );
  }
}

render(<App />, document.getElementById("app"));
