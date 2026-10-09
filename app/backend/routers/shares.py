import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.shares import SharesService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/shares", tags=["shares"])


# ---------- Pydantic Schemas ----------
class SharesData(BaseModel):
    """Entity data schema (for create/update)"""
    title: str
    code: str
    project_id: int = None
    views: int = None


class SharesUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    title: Optional[str] = None
    code: Optional[str] = None
    project_id: Optional[int] = None
    views: Optional[int] = None


class SharesResponse(BaseModel):
    """Entity response schema"""
    id: int
    title: str
    code: str
    project_id: Optional[int] = None
    views: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SharesListResponse(BaseModel):
    """List response schema"""
    items: List[SharesResponse]
    total: int
    skip: int
    limit: int


class SharesBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[SharesData]


class SharesBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: SharesUpdateData


class SharesBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[SharesBatchUpdateItem]


class SharesBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=SharesListResponse)
async def query_sharess(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query sharess with filtering, sorting, and pagination"""
    logger.debug(f"Querying sharess: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = SharesService(db)
    try:
        # Parse query JSON if provided
        query_dict = None
        if query:
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid query JSON format")
        
        result = await service.get_list(
            skip=skip, 
            limit=limit,
            query_dict=query_dict,
            sort=sort,
        )
        logger.debug(f"Found {result['total']} sharess")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid shares query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying sharess: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=SharesListResponse)
async def query_sharess_all(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query sharess with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying sharess: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = SharesService(db)
    try:
        # Parse query JSON if provided
        query_dict = None
        if query:
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid query JSON format")

        result = await service.get_list(
            skip=skip,
            limit=limit,
            query_dict=query_dict,
            sort=sort
        )
        logger.debug(f"Found {result['total']} sharess")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid shares query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying sharess: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=SharesResponse)
async def get_shares(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single shares by ID"""
    logger.debug(f"Fetching shares with id: {id}, fields={fields}")
    
    service = SharesService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Shares with id {id} not found")
            raise HTTPException(status_code=404, detail="Shares not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching shares {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=SharesResponse, status_code=201)
async def create_shares(
    data: SharesData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new shares"""
    logger.debug(f"Creating new shares with data: {data}")
    
    service = SharesService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create shares")
        
        logger.info(f"Shares created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating shares: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating shares: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[SharesResponse], status_code=201)
async def create_sharess_batch(
    request: SharesBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple sharess in a single request"""
    logger.debug(f"Batch creating {len(request.items)} sharess")
    
    service = SharesService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} sharess successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[SharesResponse])
async def update_sharess_batch(
    request: SharesBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple sharess in a single request"""
    logger.debug(f"Batch updating {len(request.items)} sharess")
    
    service = SharesService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} sharess successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=SharesResponse)
async def update_shares(
    id: int,
    data: SharesUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing shares"""
    logger.debug(f"Updating shares {id} with data: {data}")

    service = SharesService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Shares with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Shares not found")
        
        logger.info(f"Shares {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating shares {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating shares {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_sharess_batch(
    request: SharesBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple sharess by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} sharess")
    
    service = SharesService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} sharess successfully")
        return {"message": f"Successfully deleted {deleted_count} sharess", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_shares(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single shares by ID"""
    logger.debug(f"Deleting shares with id: {id}")
    
    service = SharesService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Shares with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Shares not found")
        
        logger.info(f"Shares {id} deleted successfully")
        return {"message": "Shares deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting shares {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")