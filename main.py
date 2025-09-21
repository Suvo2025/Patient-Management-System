import os
from fastapi import FastAPI, Path, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field, computed_field
from typing import Annotated, Literal, Optional, Dict
from sqlalchemy import create_engine, Column, String, Integer, Float
from sqlalchemy.orm import sessionmaker, declarative_base, Session
import json

# ---------- APP SETUP ----------
app = FastAPI(title="Patient Management System (FastAPI + SQLAlchemy)")

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# ---------- DATABASE SETUP ----------
DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    DB_PATH = os.environ.get("DB_PATH", "patients.db")
    DATABASE_URL = f"sqlite:///{DB_PATH}"

# Render/Heroku Postgres fix - ADDED NULL CHECK
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL and DATABASE_URL.startswith("sqlite") else {})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()

class PatientDB(Base):
    __tablename__ = "patients"
    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    city = Column(String, nullable=False)
    age = Column(Integer, nullable=False)
    gender = Column(String, nullable=False)
    height = Column(Float, nullable=False)
    weight = Column(Float, nullable=False)

Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ---------- PYDANTIC MODELS ----------
class Patient(BaseModel):
    id: Annotated[str, Field(..., description="ID of the patient", examples=["P001"])]
    name: Annotated[str, Field(..., description="Name of the patient")]
    city: Annotated[str, Field(..., description="City")]
    age: Annotated[int, Field(..., gt=0, lt=120, description="Age")]
    gender: Annotated[Literal["male", "female", "others"], Field(..., description="Gender")]
    height: Annotated[float, Field(..., gt=0, description="Height in meters")]
    weight: Annotated[float, Field(..., gt=0, description="Weight in kgs")]

    @computed_field
    @property
    def bmi(self) -> float:
        return round(self.weight / (self.height ** 2), 2)

    @computed_field
    @property
    def verdict(self) -> str:
        if self.bmi < 18.5:
            return "Underweight"
        elif self.bmi < 25:
            return "Normal"
        elif self.bmi < 30:
            return "Overweight"
        else:
            return "Obese"

class PatientUpdate(BaseModel):
    name: Optional[str] = None
    city: Optional[str] = None
    age: Optional[int] = Field(default=None, gt=0, lt=120)
    gender: Optional[Literal["male", "female", "others"]] = None
    height: Optional[float] = Field(default=None, gt=0)
    weight: Optional[float] = Field(default=None, gt=0)

# ---------- HELPERS ----------
def db_to_patient_dict(db_obj: PatientDB) -> Dict:
    data = {
        "id": db_obj.id,
        "name": db_obj.name,
        "city": db_obj.city,
        "age": db_obj.age,
        "gender": db_obj.gender,
        "height": db_obj.height,
        "weight": db_obj.weight,
    }
    patient = Patient(**data)
    return patient.model_dump()

# ---------- ROUTES ----------
@app.get("/")
@app.get("/dashboard")
@app.get("/app")
async def serve_index():
    # Improved file existence check
    if not os.path.exists("templates/index.html"):
        return JSONResponse(
            status_code=404,
            content={"message": "Frontend not found. Please check your deployment."}
        )
    return FileResponse("templates/index.html")

@app.get("/api")
def api_status():
    return {"message": "Patient Management System API"}

@app.get("/about")
def about():
    return {"message": "A fully functional API to manage your patient records"}

@app.get("/view")
def view_all(db: Session = Depends(get_db)):
    patients = db.query(PatientDB).all()
    return {p.id: db_to_patient_dict(p) for p in patients}

@app.get("/patient/{patient_id}")
def view_patient(patient_id: str, db: Session = Depends(get_db)):
    patient = db.get(PatientDB, patient_id)
    if patient:
        return db_to_patient_dict(patient)
    raise HTTPException(status_code=404, detail="Patient not found")

@app.get("/sort")
def sort_patients(
    sort_by: str = Query(..., description="Sort by height, weight or bmi"),
    order: str = Query("asc", description="Sort order: asc/desc"),
    db: Session = Depends(get_db),
):
    valid_fields = ["height", "weight", "bmi"]
    if sort_by not in valid_fields:
        raise HTTPException(status_code=400, detail=f"Invalid field. Choose from {valid_fields}")
    if order not in ["asc", "desc"]:
        raise HTTPException(status_code=400, detail="Invalid order. Choose asc or desc")

    patients = [db_to_patient_dict(p) for p in db.query(PatientDB).all()]
    reverse = order == "desc"
    return sorted(patients, key=lambda x: x.get(sort_by, 0), reverse=reverse)

@app.post("/create")
def create_patient(patient: Patient, db: Session = Depends(get_db)):
    if db.get(PatientDB, patient.id):
        raise HTTPException(status_code=400, detail="Patient already exists")
    new_patient = PatientDB(**patient.model_dump(exclude={"bmi", "verdict"}))
    db.add(new_patient)
    db.commit()
    db.refresh(new_patient)
    return JSONResponse(status_code=201, content={"message": "Patient created successfully"})

@app.put("/edit/{patient_id}")
def update_patient(patient_id: str, patient_update: PatientUpdate, db: Session = Depends(get_db)):
    existing = db.get(PatientDB, patient_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Patient not found")

    updates = patient_update.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(existing, key, value)

    db.commit()
    db.refresh(existing)
    return JSONResponse(status_code=200, content={"message": "Patient updated successfully"})

@app.delete("/delete/{patient_id}")
def delete_patient(patient_id: str, db: Session = Depends(get_db)):
    existing = db.get(PatientDB, patient_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Patient not found")
    db.delete(existing)
    db.commit()
    return JSONResponse(status_code=200, content={"message": "Patient deleted successfully"})

@app.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    patients = db.query(PatientDB).all()
    if not patients:
        return {"total": 0, "average_bmi": 0, "verdict_counts": {}, "city_counts": {}}

    patient_dicts = [db_to_patient_dict(p) for p in patients]
    total = len(patient_dicts)
    average_bmi = round(sum(p["bmi"] for p in patient_dicts) / total, 2)

    verdict_counts = {}
    city_counts = {}
    for p in patient_dicts:
        verdict_counts[p["verdict"]] = verdict_counts.get(p["verdict"], 0) + 1
        city_counts[p["city"]] = city_counts.get(p["city"], 0) + 1

    return {
        "total": total,
        "average_bmi": average_bmi,
        "verdict_counts": verdict_counts,
        "city_counts": city_counts,
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)