"""
yolo_matcher.py
---------------
Detects champion icons on the LoL minimap using a YOLOv8 model
exported to ONNX format, running inference via ONNX Runtime.

No PyTorch or Ultralytics dependency required.
"""

import json
import os
from dataclasses import dataclass, field
from typing import Dict, List, Tuple

import cv2
import numpy as np
import onnxruntime as ort


@dataclass
class DetectedChampion:
    name: str
    team: str
    player_id: int       # 1-5
    x_norm: float
    y_norm: float
    x_1000: int
    y_1000: int
    confidence: float
    bbox: Tuple[int, int, int, int] = field(default_factory=tuple)


YOLO_CONFIDENCE = 0.25
NMS_IOU_THRESHOLD = 0.45
INPUT_SIZE = 640


class YoloMatcher:
    def __init__(self, model_dir: str, locked_roster: Dict[str, List[str]], ally_team: str = "blue"):
        """
        model_dir: path to client/detection/assets/yolo/ containing best.onnx & champMap.json
        locked_roster: {"blue": ["Jinx", ...], "red": ["Annie", ...]}
        ally_team: which team the local player belongs to
        """
        model_path = os.path.join(model_dir, "best.onnx")
        champ_map_path = os.path.join(model_dir, "champMap.json")

        if not os.path.exists(model_path):
            raise FileNotFoundError(f"ONNX model not found at {model_path}")

        print(f"[YoloMatcher] Loading ONNX model from {model_path}...")
        self.session = ort.InferenceSession(
            model_path,
            providers=["CPUExecutionProvider"],
        )
        self.input_name = self.session.get_inputs()[0].name
        print(f"[YoloMatcher] ONNX model loaded successfully.")

        # Load the class index -> champion name mapping
        with open(champ_map_path, "r") as f:
            raw_map = json.load(f)
        self.class_to_name: Dict[int, str] = {}
        for idx_str, info in raw_map.items():
            self.class_to_name[int(idx_str)] = info["champ_name"]

        self.num_classes = len(self.class_to_name)

        # Build reverse mapping: champion name -> (team, player_id)
        self.ally_team = ally_team
        self.roster = locked_roster
        self.roster_lookup: Dict[str, Tuple[str, int]] = {}
        if locked_roster:
            for team in ["blue", "red"]:
                for idx, champ_name in enumerate(locked_roster.get(team, [])):
                    self.roster_lookup[champ_name] = (team, idx + 1)

        self.last_known_ally_positions: Dict[str, Tuple[float, float]] = {}
        self._frame_count = 0

    def _preprocess(self, frame_bgr: np.ndarray) -> np.ndarray:
        """Preprocess frame for YOLOv8: resize with letterbox, normalize, NCHW."""
        img = cv2.resize(frame_bgr, (INPUT_SIZE, INPUT_SIZE))
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        img = img.astype(np.float32) / 255.0
        img = np.transpose(img, (2, 0, 1))  # HWC -> CHW
        img = np.expand_dims(img, axis=0)    # add batch dim
        return img

    def _postprocess(self, output: np.ndarray, orig_h: int, orig_w: int) -> List[DetectedChampion]:
        """
        Post-process YOLOv8 ONNX output.
        YOLOv8 outputs shape: (1, 4+num_classes, num_detections)
        Rows 0-3: cx, cy, w, h
        Rows 4+: class confidences
        """
        # output shape: (1, 4+num_classes, N) -> transpose to (N, 4+num_classes)
        predictions = output[0].T  # shape: (N, 4+num_classes)

        # Extract boxes and class scores
        boxes = predictions[:, :4]          # cx, cy, w, h (in 640x640 space)
        class_scores = predictions[:, 4:]   # (N, num_classes)

        # Get best class for each detection
        class_ids = np.argmax(class_scores, axis=1)
        confidences = np.max(class_scores, axis=1)

        # Filter by confidence
        mask = confidences >= YOLO_CONFIDENCE
        boxes = boxes[mask]
        class_ids = class_ids[mask]
        confidences = confidences[mask]

        if len(boxes) == 0:
            return []

        # Convert from cx,cy,w,h to x1,y1,x2,y2
        x1 = boxes[:, 0] - boxes[:, 2] / 2
        y1 = boxes[:, 1] - boxes[:, 3] / 2
        x2 = boxes[:, 0] + boxes[:, 2] / 2
        y2 = boxes[:, 1] + boxes[:, 3] / 2

        # Apply NMS
        indices = cv2.dnn.NMSBoxes(
            bboxes=np.stack([x1, y1, x2 - x1, y2 - y1], axis=1).tolist(),
            scores=confidences.tolist(),
            score_threshold=YOLO_CONFIDENCE,
            nms_threshold=NMS_IOU_THRESHOLD,
        )
        if indices is None or len(indices) == 0:
            return []
        indices = indices.flatten()

        # Scale factors from 640x640 back to original frame
        scale_x = orig_w / INPUT_SIZE
        scale_y = orig_h / INPUT_SIZE

        all_detections: List[DetectedChampion] = []
        detected_names: set = set()

        for i in indices:
            cls_id = int(class_ids[i])
            conf = float(confidences[i])

            champ_name = self.class_to_name.get(cls_id, None)
            if champ_name is None:
                continue
            if champ_name not in self.roster_lookup:
                continue

            team, player_id = self.roster_lookup[champ_name]

            # Scale back to original frame coords
            bx1 = float(x1[i]) * scale_x
            by1 = float(y1[i]) * scale_y
            bx2 = float(x2[i]) * scale_x
            by2 = float(y2[i]) * scale_y

            cx = (bx1 + bx2) / 2.0
            cy = (by1 + by2) / 2.0
            x_norm = cx / orig_w
            y_norm = cy / orig_h

            if team == self.ally_team:
                self.last_known_ally_positions[champ_name] = (x_norm, y_norm)

            all_detections.append(DetectedChampion(
                name=champ_name,
                team=team,
                player_id=player_id,
                x_norm=round(x_norm, 4),
                y_norm=round(y_norm, 4),
                x_1000=int(x_norm * 1000),
                y_1000=int(y_norm * 1000),
                confidence=round(conf, 3),
                bbox=(int(bx1), int(by1), int(bx2 - bx1), int(by2 - by1)),
            ))
            detected_names.add(champ_name)

        # For allies not detected, use last known position
        for champ_name, (team, player_id) in self.roster_lookup.items():
            if champ_name not in detected_names:
                if team == self.ally_team and champ_name in self.last_known_ally_positions:
                    x_norm, y_norm = self.last_known_ally_positions[champ_name]
                    all_detections.append(DetectedChampion(
                        name=champ_name,
                        team=team,
                        player_id=player_id,
                        x_norm=round(x_norm, 4),
                        y_norm=round(y_norm, 4),
                        x_1000=int(x_norm * 1000),
                        y_1000=int(y_norm * 1000),
                        confidence=0.0,
                        bbox=(0, 0, 0, 0),
                    ))

        return all_detections

    def detect(self, frame_bgr: np.ndarray, debug_mode: bool = False) -> List[DetectedChampion]:
        """Run ONNX inference on the minimap frame."""
        if frame_bgr is None or frame_bgr.size == 0:
            return []

        h, w = frame_bgr.shape[:2]
        self._frame_count += 1

        input_tensor = self._preprocess(frame_bgr)
        outputs = self.session.run(None, {self.input_name: input_tensor})
        return self._postprocess(outputs[0], h, w)

    def has_templates(self) -> bool:
        return len(self.roster_lookup) > 0

    def template_count(self) -> int:
        return len(self.roster_lookup)
