// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract MedicalRecord {

    struct Record {
        string ipfsCID;
        string fileHash;
        string recordType;
        string description;
        uint256 timestamp;
        address uploadedBy;
    }

    mapping(address => Record[]) private patientRecords;
    mapping(address => mapping(address => bool)) private accessPermission;
    mapping(address => mapping(address => bool)) private uploadPermission;
    mapping(address => address[]) private grantedDoctorsList;
    mapping(address => address[]) private uploadPermittedDoctorsList;

    event RecordUploaded(
        address indexed patient,
        address indexed uploadedBy,
        string ipfsCID,
        string fileHash,
        string recordType,
        uint256 timestamp
    );
    event AccessGranted(address indexed patient, address indexed doctor);
    event AccessRevoked(address indexed patient, address indexed doctor);
    event UploadPermissionGranted(address indexed patient, address indexed doctor);
    event UploadPermissionRevoked(address indexed patient, address indexed doctor);
    event IntegrityVerified(
        address indexed patient,
        address indexed verifier,
        string ipfsCID,
        string fileHash,
        bool isValid,
        uint256 timestamp
    );

    // Patient uploads their own encrypted record with SHA-256 integrity hash
    function uploadRecord(
        string memory _ipfsCID,
        string memory _fileHash,
        string memory _recordType,
        string memory _description
    ) public {
        patientRecords[msg.sender].push(Record(
            _ipfsCID,
            _fileHash,
            _recordType,
            _description,
            block.timestamp,
            msg.sender
        ));
        emit RecordUploaded(msg.sender, msg.sender, _ipfsCID, _fileHash, _recordType, block.timestamp);
    }

    // Doctor uploads record on behalf of patient (requires upload permission)
    function doctorUploadRecord(
        address _patient,
        string memory _ipfsCID,
        string memory _fileHash,
        string memory _recordType,
        string memory _description
    ) public {
        require(uploadPermission[_patient][msg.sender], "Upload permission not granted by patient");
        patientRecords[_patient].push(Record(
            _ipfsCID,
            _fileHash,
            _recordType,
            _description,
            block.timestamp,
            msg.sender
        ));
        emit RecordUploaded(_patient, msg.sender, _ipfsCID, _fileHash, _recordType, block.timestamp);
    }

    // Log integrity verification outcome on-chain (Table IV in research paper)
    function logIntegrityVerification(
        address _patient,
        string memory _ipfsCID,
        string memory _fileHash,
        bool _isValid
    ) public {
        require(
            msg.sender == _patient || accessPermission[_patient][msg.sender],
            "Access denied: you do not have permission to verify records for this patient"
        );
        emit IntegrityVerified(_patient, msg.sender, _ipfsCID, _fileHash, _isValid, block.timestamp);
    }

    // Grant view access to doctor
    function grantAccess(address _doctor) public {
        require(_doctor != address(0), "Invalid doctor address");
        if (!accessPermission[msg.sender][_doctor]) {
            grantedDoctorsList[msg.sender].push(_doctor);
        }
        accessPermission[msg.sender][_doctor] = true;
        emit AccessGranted(msg.sender, _doctor);
    }

    // Revoke view access from doctor
    function revokeAccess(address _doctor) public {
        accessPermission[msg.sender][_doctor] = false;
        address[] storage list = grantedDoctorsList[msg.sender];
        for (uint i = 0; i < list.length; i++) {
            if (list[i] == _doctor) {
                list[i] = list[list.length - 1];
                list.pop();
                break;
            }
        }
        emit AccessRevoked(msg.sender, _doctor);
    }

    // Grant upload permission to doctor
    function grantUploadPermission(address _doctor) public {
        require(_doctor != address(0), "Invalid doctor address");
        if (!uploadPermission[msg.sender][_doctor]) {
            uploadPermittedDoctorsList[msg.sender].push(_doctor);
        }
        uploadPermission[msg.sender][_doctor] = true;
        emit UploadPermissionGranted(msg.sender, _doctor);
    }

    // Revoke upload permission from doctor
    function revokeUploadPermission(address _doctor) public {
        uploadPermission[msg.sender][_doctor] = false;
        address[] storage list = uploadPermittedDoctorsList[msg.sender];
        for (uint i = 0; i < list.length; i++) {
            if (list[i] == _doctor) {
                list[i] = list[list.length - 1];
                list.pop();
                break;
            }
        }
        emit UploadPermissionRevoked(msg.sender, _doctor);
    }

    function hasAccess(address _patient, address _viewer) public view returns (bool) {
        return _viewer == _patient || accessPermission[_patient][_viewer];
    }

    function hasUploadPermission(address _patient, address _doctor) public view returns (bool) {
        return uploadPermission[_patient][_doctor];
    }

    function getRecords(address _patient) public view returns (Record[] memory) {
        require(
            msg.sender == _patient || accessPermission[_patient][msg.sender],
            "Access denied: you do not have permission to view this record"
        );
        return patientRecords[_patient];
    }

    function getRecordCount(address _patient) public view returns (uint256) {
        require(
            msg.sender == _patient || accessPermission[_patient][msg.sender],
            "Access denied"
        );
        return patientRecords[_patient].length;
    }

    function getGrantedDoctors(address _patient) public view returns (address[] memory) {
        require(msg.sender == _patient, "Only patient can view their granted doctors list");
        return grantedDoctorsList[_patient];
    }

    function getUploadPermittedDoctors(address _patient) public view returns (address[] memory) {
        require(msg.sender == _patient, "Only patient can view upload permitted doctors list");
        return uploadPermittedDoctorsList[_patient];
    }
}
