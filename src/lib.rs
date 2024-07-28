use std::collections::VecDeque;

use js_sys::Uint8Array;
use wasm_bindgen::prelude::*;

use sony_protocol::{
    v1::{self, AncPayload, Packet, PacketContent, PayloadCommand1},
    Device, State,
};

#[wasm_bindgen(start)]
pub fn start() -> Result<(), JsValue> {
    console_error_panic_hook::set_once();
    tracing_wasm::set_as_global_default();
    Ok(())
}

#[wasm_bindgen]
pub struct SingleDeviceBattery {
    pub level: u8,
}

#[wasm_bindgen]
pub struct DualDeviceBattery {
    pub left: u8,
    pub right: u8,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
#[wasm_bindgen]
pub enum AncMode {
    Off,
    AmbiantMode,
    On,
    Wind,
}

impl From<sony_protocol::v1::AncMode> for AncMode {
    fn from(value: sony_protocol::v1::AncMode) -> Self {
        match value {
            sony_protocol::v1::AncMode::Off => Self::Off,
            sony_protocol::v1::AncMode::AmbiantMode => Self::AmbiantMode,
            sony_protocol::v1::AncMode::On => Self::On,
            sony_protocol::v1::AncMode::Wind => Self::Wind,
        }
    }
}

#[derive(Debug, PartialEq, Eq, Clone)]
#[wasm_bindgen]
pub struct AncState {
    pub anc_mode: AncMode,
    pub focus_on_voice: bool,
    pub ambiant_level: u8,
}

impl From<sony_protocol::v1::AncPayload> for AncState {
    fn from(value: sony_protocol::v1::AncPayload) -> Self {
        Self {
            anc_mode: value.anc_mode.into(),
            ambiant_level: value.ambiant_level,
            focus_on_voice: value.focus_on_voice,
        }
    }
}

#[wasm_bindgen(getter_with_clone)]
#[derive(Debug)]
pub struct SonyHeadphone {
    packet_queue: VecDeque<PacketContent>,
    device_session: sony_protocol::Device,
    pub battery_device: JsValue,
    pub battery_case: JsValue,
    pub anc_state: Option<AncState>,
}

#[wasm_bindgen]
impl SonyHeadphone {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Result<SonyHeadphone, JsError> {
        let mut session = Device::default();
        session.send_packet(sony_protocol::v1::PacketContent::Command1(
            sony_protocol::v1::PayloadCommand1::InitRequest,
        ))?;
        Ok(Self {
            packet_queue: VecDeque::new(),
            device_session: session,
            battery_device: JsValue::null(),
            battery_case: JsValue::null(),
            anc_state: None,
        })
    }

    fn packet_received(&mut self, packet: Packet) {
        match packet.content {
            PacketContent::Command1(c) => match c {
                PayloadCommand1::InitReply(_) => {
                    self.packet_queue.push_back(PacketContent::Command1(
                        PayloadCommand1::AmbientSoundControlGet,
                    ));
                    self.packet_queue.push_back(PacketContent::Command1(
                        PayloadCommand1::BatteryLevelRequest(
                            sony_protocol::v1::BatteryType::Single,
                        ),
                    ));
                    self.packet_queue.push_back(PacketContent::Command1(
                        PayloadCommand1::BatteryLevelRequest(sony_protocol::v1::BatteryType::Dual),
                    ));
                    self.packet_queue.push_back(PacketContent::Command1(
                        PayloadCommand1::BatteryLevelRequest(sony_protocol::v1::BatteryType::Case),
                    ));
                }
                PayloadCommand1::AmbientSoundControlRet(n)
                | PayloadCommand1::AmbientSoundControlNotify(n) => {
                    self.anc_state = Some(n.into());
                }
                PayloadCommand1::BatteryLevelReply(b) | PayloadCommand1::BatteryLevelNotify(b) => {
                    match b {
                        sony_protocol::v1::BatteryState::Single {
                            level,
                            is_charging: _,
                        } => self.battery_device = SingleDeviceBattery { level }.into(),
                        sony_protocol::v1::BatteryState::Case {
                            level,
                            is_charging: _,
                        } => self.battery_case = SingleDeviceBattery { level }.into(),
                        sony_protocol::v1::BatteryState::Dual {
                            level_left,
                            is_left_charging: _,
                            level_right,
                            is_right_charging: _,
                        } => {
                            self.battery_device = DualDeviceBattery {
                                left: level_left,
                                right: level_right,
                            }
                            .into()
                        }
                    }
                }
                _ => (),
            },
            _ => (),
        }
    }

    pub fn parse_packet(&mut self, buffer: &[u8]) -> Result<(), JsError> {
        let _ = self.device_session.received_packet(&buffer)?;
        Ok(())
    }

    pub fn poll(&mut self) -> Result<Action, JsError> {
        let polled = self.device_session.poll()?;

        let res = match polled {
            State::ReceivedPacket(p) => {
                self.packet_received(p);
                Action {
                    action_type: ActionType::RefreshUi,
                    data: JsValue::null(),
                }
            }
            State::SendPacket(p) => Action {
                action_type: ActionType::Send,
                data: JsValue::from(Uint8Array::from(p)),
            },
            State::WaitingPacket(i) => {
                if i.is_none() && !self.packet_queue.is_empty() {
                    let packet = self.packet_queue.pop_front().unwrap();
                    self.device_session.send_packet(packet)?;
                    Action {
                        action_type: ActionType::PollAgain,
                        data: JsValue::null(),
                    }
                } else {
                    Action {
                        action_type: ActionType::Wait,
                        data: if let Some(i) = i {
                            JsValue::from((i - web_time::Instant::now()).as_millis())
                        } else {
                            JsValue::null()
                        },
                    }
                }
            }
        };

        Ok(res)
    }

    pub fn change_anc_mode(&mut self) {
        let new_mode = if let Some(anc_mode) = &self.anc_state {
            match anc_mode.anc_mode {
                AncMode::Off => AncPayload {
                    anc_mode: v1::AncMode::AmbiantMode,
                    focus_on_voice: false,
                    ambiant_level: 17,
                },
                AncMode::AmbiantMode => AncPayload {
                    anc_mode: v1::AncMode::On,
                    focus_on_voice: false,
                    ambiant_level: 0,
                },
                AncMode::On => AncPayload {
                    anc_mode: v1::AncMode::Wind,
                    focus_on_voice: false,
                    ambiant_level: 0,
                },
                AncMode::Wind => AncPayload {
                    anc_mode: v1::AncMode::Off,
                    focus_on_voice: false,
                    ambiant_level: 0,
                },
            }
        } else {
            AncPayload {
                anc_mode: v1::AncMode::On,
                focus_on_voice: false,
                ambiant_level: 0,
            }
        };

        self.packet_queue.push_back(PacketContent::Command1(
            PayloadCommand1::AmbientSoundControlSet(new_mode),
        ));
    }
}

#[wasm_bindgen(getter_with_clone)]
#[derive(Debug)]
pub struct Action {
    pub action_type: ActionType,
    pub data: JsValue,
}

#[derive(Clone, Copy, Debug)]
#[wasm_bindgen]
pub enum ActionType {
    Wait,
    Send,
    PollAgain,
    RefreshUi,
}
