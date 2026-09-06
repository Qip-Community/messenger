rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /users/{userId} {
      allow read: if request.auth != null;
      allow create, update: if request.auth != null && request.auth.uid == userId;
      allow delete: if false;
    }

    match /rooms/{roomId}/messages/{messageId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.resource.data.uid == request.auth.uid;
      allow update, delete: if false;
    }

    match /dms/{pairId}/messages/{messageId} {
      allow read: if request.auth != null 
                   && pairId.contains(request.auth.uid);
      allow create: if request.auth != null 
                   && request.resource.data.uid == request.auth.uid
                   && pairId.contains(request.auth.uid);
      allow update, delete: if false;
    }

    match /friendRequests/{reqId} {
      allow read: if request.auth != null
                   && (resource.data.from == request.auth.uid || resource.data.to == request.auth.uid);
      allow create: if request.auth != null
                   && request.resource.data.from == request.auth.uid
                   && request.resource.data.status == 'pending';
      allow update: if request.auth != null
                   && resource.data.to == request.auth.uid;
      allow delete: if request.auth != null
                   && (resource.data.from == request.auth.uid || resource.data.to == request.auth.uid);
    }

    match /friendships/{pairId} {
      allow read: if request.auth != null && request.auth.uid in resource.data.users;
      allow create: if request.auth != null && request.auth.uid in request.resource.data.users;
      allow update, delete: if false;
    }
  }
}