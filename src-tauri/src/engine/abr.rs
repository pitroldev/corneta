/// Bitrate changes are in kbps and require the supervisor to restart the encoder.
pub enum BitrateAction {
    Hold,
    Down(u32),
    Up(u32),
}

/// AIMD controller; cooldown counts speed samples because each change reconnects the destination.
pub struct AutoBitrate {
    base: u32,
    floor: u32,
    current: u32,
    slow: u32,
    fast: u32,
    cooldown: u32,
}

impl AutoBitrate {
    const SLOW: f64 = 0.9;
    const SEVERE: f64 = 0.6;
    const COOLDOWN: u32 = 5;
    const RECOVER: u32 = 45;
    const NEED_MILD: u32 = 8;
    const NEED_SEVERE: u32 = 3;

    pub fn new(base: u32, floor: u32) -> Self {
        let floor = floor.min(base);
        Self {
            base,
            floor,
            current: base,
            slow: 0,
            fast: 0,
            cooldown: 0,
        }
    }

    pub fn current(&self) -> u32 {
        self.current
    }

    /// Preserve bitrate and cooldown across the restart caused by the last bitrate change.
    pub fn on_reconnect(&mut self) {
        self.slow = 0;
        self.fast = 0;
    }

    /// Up/Down decisions also update `current`.
    pub fn on_speed(&mut self, speed: f64) -> BitrateAction {
        if self.cooldown > 0 {
            self.cooldown -= 1;
        }
        if speed < Self::SLOW {
            self.fast = 0;
            self.slow += 1;
            if self.cooldown == 0 && self.current > self.floor {
                let severe = speed < Self::SEVERE;
                let need = if severe {
                    Self::NEED_SEVERE
                } else {
                    Self::NEED_MILD
                };
                if self.slow >= need {
                    let cut = if severe { 0.6 } else { 0.8 };
                    let next = ((self.current as f64 * cut) as u32).max(self.floor);
                    if next < self.current {
                        self.current = next;
                        self.slow = 0;
                        self.cooldown = Self::COOLDOWN;
                        return BitrateAction::Down(next);
                    }
                }
            }
        } else {
            self.slow = 0;
            self.fast += 1;
            if self.cooldown == 0 && self.fast >= Self::RECOVER && self.current < self.base {
                // Additive recovery avoids overshooting into another congestion/restart cycle.
                let step = (self.base / 8).max(300);
                let next = (self.current + step).min(self.base);
                self.current = next;
                self.fast = 0;
                self.cooldown = Self::COOLDOWN;
                return BitrateAction::Up(next);
            }
        }
        BitrateAction::Hold
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn feed_down(abr: &mut AutoBitrate, speed: f64, n: u32) -> Option<u32> {
        let mut last = None;
        for _ in 0..n {
            if let BitrateAction::Down(k) = abr.on_speed(speed) {
                last = Some(k);
            }
        }
        last
    }

    #[test]
    fn abr_starts_at_base() {
        assert_eq!(AutoBitrate::new(6000, 2400).current(), 6000);
    }

    #[test]
    fn abr_mild_congestion_cuts_20pct_after_8() {
        let mut a = AutoBitrate::new(6000, 2400);
        assert_eq!(feed_down(&mut a, 0.85, 7), None);
        assert_eq!(feed_down(&mut a, 0.85, 1), Some(4800));
        assert_eq!(a.current(), 4800);
    }

    #[test]
    fn abr_severe_congestion_cuts_40pct_fast() {
        let mut a = AutoBitrate::new(6000, 2400);
        assert_eq!(feed_down(&mut a, 0.5, 3), Some(3600));
        assert_eq!(a.current(), 3600);
    }

    #[test]
    fn abr_never_below_floor() {
        let mut a = AutoBitrate::new(6000, 2400);
        for _ in 0..200 {
            a.on_speed(0.3);
        }
        assert_eq!(a.current(), 2400);
    }

    #[test]
    fn abr_recovers_additively_capped_at_base() {
        let mut a = AutoBitrate::new(6000, 2400);
        feed_down(&mut a, 0.85, 8);
        assert_eq!(a.current(), 4800);
        let mut ups = vec![];
        for _ in 0..300 {
            if let BitrateAction::Up(k) = a.on_speed(1.0) {
                ups.push(k);
            }
        }
        assert!(ups.contains(&5550), "first additive step 4800+750: {ups:?}");
        assert_eq!(a.current(), 6000);
        assert!(
            ups.iter().all(|&k| k <= 6000),
            "never above the base: {ups:?}"
        );
    }

    #[test]
    fn abr_cooldown_blocks_immediate_rethrash() {
        let mut a = AutoBitrate::new(6000, 2400);
        feed_down(&mut a, 0.5, 3);
        for _ in 0..4 {
            assert!(matches!(a.on_speed(0.5), BitrateAction::Hold));
        }
        assert!(matches!(a.on_speed(0.5), BitrateAction::Down(_)));
    }

    #[test]
    fn abr_on_reconnect_keeps_bitrate() {
        let mut a = AutoBitrate::new(6000, 2400);
        feed_down(&mut a, 0.85, 8);
        a.on_reconnect();
        assert_eq!(a.current(), 4800);
    }
}
